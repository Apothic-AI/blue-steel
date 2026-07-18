import { describe, expect, test } from 'bun:test';
import EventEmitter from 'eventemitter3';
import { AgentEvents } from '@/common/events';

// Minimal Agent-like class that isolates pause/resume logic for testing
// without requiring LLM clients, connectors, or BAML dependencies
class PauseableLoop {
    public readonly events: EventEmitter<AgentEvents> = new EventEmitter();
    private doneActing: boolean = false;
    private _paused: boolean = false;
    private _pauseResolve: (() => void) | null = null;

    private async _waitIfPaused(): Promise<void> {
        if (!this._paused) return;
        this.events.emit('pause');
        await new Promise<void>((resolve) => {
            this._pauseResolve = resolve;
        });
    }

    pause(): void {
        this._paused = true;
    }

    resume(): void {
        this._paused = false;
        if (this._pauseResolve) {
            this._pauseResolve();
            this._pauseResolve = null;
        }
        this.events.emit('resume');
    }

    get paused(): boolean {
        return this._paused;
    }

    queueDone(): void {
        this.doneActing = true;
    }

    stop(): void {
        this.doneActing = true;
        if (this._paused) {
            this.resume();
        }
    }

    /**
     * Simulates the Agent._act() loop structure.
     * Each "batch" is an array of action labels. The loop processes batches
     * until doneActing is set, mirroring the real while(true) loop.
     */
    async runLoop(batches: string[][], onAction: (label: string) => void): Promise<void> {
        this.doneActing = false;
        let batchIndex = 0;

        while (true) {
            const actions = batches[batchIndex % batches.length];
            batchIndex++;

            for (const action of actions) {
                await this._waitIfPaused();
                if (this.doneActing) return;
                onAction(action);
            }

            await this._waitIfPaused();
            if (this.doneActing) return;
        }
    }
}

describe('Agent pause/resume', () => {
    test('pause() sets paused flag', () => {
        const loop = new PauseableLoop();
        expect(loop.paused).toBe(false);
        loop.pause();
        expect(loop.paused).toBe(true);
    });

    test('resume() clears paused flag', () => {
        const loop = new PauseableLoop();
        loop.pause();
        loop.resume();
        expect(loop.paused).toBe(false);
    });

    test('resume() when not paused is a no-op (no error)', () => {
        const loop = new PauseableLoop();
        expect(() => loop.resume()).not.toThrow();
        expect(loop.paused).toBe(false);
    });

    test('loop pauses before action and resumes on resume()', async () => {
        const loop = new PauseableLoop();
        const executed: string[] = [];

        // Pause immediately so first action blocks
        loop.pause();

        const loopPromise = loop.runLoop(
            [['a', 'b']],
            (label) => {
                executed.push(label);
                // After executing both actions, stop
                if (executed.length === 2) loop.queueDone();
            }
        );

        // Give microtasks a chance to settle — loop should be blocked
        await new Promise(r => setTimeout(r, 20));
        expect(executed).toEqual([]);

        // Resume — loop should execute actions then stop
        loop.resume();
        await loopPromise;
        expect(executed).toEqual(['a', 'b']);
    });

    test('pause mid-batch stops before next action', async () => {
        const loop = new PauseableLoop();
        const executed: string[] = [];

        const loopPromise = loop.runLoop(
            [['a', 'b', 'c']],
            (label) => {
                executed.push(label);
                if (label === 'a') loop.pause(); // pause after first action
            }
        );

        // Wait for loop to pause after 'a'
        await new Promise(r => setTimeout(r, 20));
        expect(executed).toEqual(['a']);

        // Resume and let it finish
        loop.resume();
        await new Promise(r => setTimeout(r, 20));
        // 'b' should now execute, pause again since flag was cleared by resume
        // Actually after resume, _paused is false, so b and c run
        expect(executed).toContain('b');
        expect(executed).toContain('c');

        // Stop the loop
        loop.stop();
        await loopPromise;
    });

    test('pause emits pause event, resume emits resume event', async () => {
        const loop = new PauseableLoop();
        const events: string[] = [];

        loop.events.on('pause', () => events.push('pause'));
        loop.events.on('resume', () => events.push('resume'));

        loop.pause();

        const loopPromise = loop.runLoop(
            [['a']],
            () => loop.queueDone()
        );

        // Wait for loop to hit _waitIfPaused and emit 'pause'
        await new Promise(r => setTimeout(r, 20));
        expect(events).toEqual(['pause']);

        loop.resume();
        await loopPromise;
        expect(events).toEqual(['pause', 'resume']);
    });

    test('stop() while paused unblocks the loop', async () => {
        const loop = new PauseableLoop();
        const executed: string[] = [];

        loop.pause();

        const loopPromise = loop.runLoop(
            [['a', 'b']],
            (label) => executed.push(label)
        );

        await new Promise(r => setTimeout(r, 20));
        expect(executed).toEqual([]);

        // stop() should set doneActing and resume so loop exits
        loop.stop();
        await loopPromise;

        // No actions should have executed — loop exits immediately after unblocking
        expect(executed).toEqual([]);
    });

    test('pause between batches blocks next iteration', async () => {
        const loop = new PauseableLoop();
        const executed: string[] = [];
        let batchCount = 0;

        const loopPromise = loop.runLoop(
            [['a'], ['b']],
            (label) => {
                executed.push(label);
                batchCount++;
                // After first batch completes, pause before second batch
                if (batchCount === 1) loop.pause();
                if (batchCount === 2) loop.queueDone();
            }
        );

        // Let first batch run, then loop should pause at between-batch check
        await new Promise(r => setTimeout(r, 20));
        expect(executed).toEqual(['a']);

        loop.resume();
        await loopPromise;
        expect(executed).toEqual(['a', 'b']);
    });

    test('multiple pause/resume cycles work correctly', async () => {
        const loop = new PauseableLoop();
        const executed: string[] = [];
        let actionCount = 0;

        const loopPromise = loop.runLoop(
            [['x']],
            (label) => {
                actionCount++;
                executed.push(`${label}${actionCount}`);
                if (actionCount < 3) {
                    loop.pause(); // pause after each action
                } else {
                    loop.queueDone(); // done after 3rd
                }
            }
        );

        // First action runs, then pauses
        await new Promise(r => setTimeout(r, 20));
        expect(executed).toEqual(['x1']);

        loop.resume();
        await new Promise(r => setTimeout(r, 20));
        expect(executed).toEqual(['x1', 'x2']);

        loop.resume();
        await loopPromise;
        expect(executed).toEqual(['x1', 'x2', 'x3']);
    });
});
