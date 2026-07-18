import { RegisteredTest } from "@/discovery/types";
import { TestState } from "@/runner/state";
import { TestRenderer } from "@/renderer";
import logger from '@/logger';
import { calculateCost } from '@/util';

function statusFromState(state: TestState): 'pending' | 'running' | 'passed' | 'failed' {
    return state.failure
        ? 'failed'
        : (state.doneAt ? 'passed' : (state.startedAt ? 'running' : 'pending'));
}

function testToMeta(test: RegisteredTest): { id: string; title?: string; file?: string } {
    return {
        id: test.id,
        title: test.title,
        file: test.filepath
    };
}

function buildTestContext(state: TestState): {
    steps: number;
    checks: number;
    startedAt?: number;
    doneAt?: number;
    elapsedMs?: number;
    tokens?: {
        input: number;
        output: number;
        cost?: number;
    };
    context: {
        step?: string;
        action?: string;
        stepStatus?: string;
        check?: string;
        checkStatus?: string;
        thought?: string;
    };
} {
    const now = Date.now();
    const startedAt = state.startedAt ?? null;
    const doneAt = state.doneAt ?? null;
    const elapsedMs = startedAt ? (doneAt ? doneAt - startedAt : now - startedAt) : null;

    let steps = 0;
    let checks = 0;
    let ctxParts: { step?: string; action?: string; stepStatus?: string; check?: string; checkStatus?: string; thought?: string } = {};

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let cost: number | undefined;

    if (state.modelUsage && state.modelUsage.length > 0) {
        for (const usage of state.modelUsage) {
            totalInputTokens += usage.inputTokens;
            totalOutputTokens += usage.outputTokens;
        }

        const firstModelEntry = state.modelUsage[0];
        if (firstModelEntry && firstModelEntry.llm) {
            const modelKey = typeof firstModelEntry.llm === 'string' ? firstModelEntry.llm : JSON.stringify(firstModelEntry.llm);
            cost = calculateCost(modelKey, totalInputTokens, totalOutputTokens);
        }
    }

    if (Array.isArray(state.stepsAndChecks)) {
        for (const item of state.stepsAndChecks) {
            if (item.variant === 'check') checks++;
            else steps++;
        }

        const latest = state.stepsAndChecks[state.stepsAndChecks.length - 1];
        if (latest) {
            if (latest.variant === 'step') {
                if (latest.description) {
                    ctxParts.step = latest.description;
                }
                if (Array.isArray(latest.actions) && latest.actions.length > 0) {
                    const lastAction = latest.actions[latest.actions.length - 1];
                    if (lastAction?.pretty) {
                        ctxParts.action = lastAction.pretty;
                    }
                }
                if (latest.status === 'failed') {
                    ctxParts.stepStatus = 'failed';
                }
                if (latest.thoughts && latest.thoughts.length > 0) {
                    ctxParts.thought = latest.thoughts[latest.thoughts.length - 1].text;
                }
            } else {
                if (latest.description) {
                    ctxParts.check = latest.description;
                    if (latest.status === 'passed' || latest.status === 'failed') {
                        ctxParts.checkStatus = latest.status;
                    }
                }
            }
        }
    }

    return {
        steps,
        checks,
        startedAt: startedAt ?? undefined,
        doneAt: doneAt ?? undefined,
        elapsedMs: elapsedMs ?? undefined,
        tokens: totalInputTokens > 0 || totalOutputTokens > 0 ? {
            input: totalInputTokens,
            output: totalOutputTokens,
            cost: cost
        } : undefined,
        context: ctxParts
    };
}

export class DebugRenderer implements TestRenderer {
    private plain: boolean;

    constructor(plain: boolean = false) {
        this.plain = plain;
    }

    public stop() {
        return new Promise<void>((resolve, reject) => {
            logger.flush((err) => {
                if (err) reject(err);
                resolve();
            });
        });
    }

    public onTestStateUpdated(test: RegisteredTest, state: TestState): void {
        const status = statusFromState(state);
        const testMeta = testToMeta(test);
        const { steps, checks, startedAt, doneAt, elapsedMs, tokens, context } = buildTestContext(state);

        if (this.plain) {
            let message = `${testMeta.file} "${testMeta.title || testMeta.id}": ${status}`;
            if (status === 'running') {
                if (context.step) message += ` - step: ${context.step}`;
                if (context.action) message += ` / ${context.action}`;
            }
            if (status === 'failed' && state.failure) {
                message += `\n  failure: ${state.failure.message || state.failure}`;
            }
            console.log(message);
        }

        const payload = {
            test: testMeta,
            state: {
                status,
                startedAt,
                doneAt,
                elapsedMs
            },
            progress: { steps, checks },
            tokens,
            context,
            err: state.failure || undefined
        };

        logger.debug(payload, 'test state');
    }
}
