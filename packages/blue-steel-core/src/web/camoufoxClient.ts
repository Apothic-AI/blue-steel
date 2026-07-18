import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface, type Interface } from 'node:readline';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import logger from '@/logger';
import { Logger } from 'pino';

export interface CamoufoxClientOptions {
    skillDir?: string;
    profileName?: string;
    profile?: string;
    headless?: boolean;
    noContainerProxy?: boolean;
    pythonPath?: string;
    controllerPath?: string;
    commandTimeoutMs?: number;
    readyTimeoutMs?: number;
}

export interface CamoufoxReadyEvent {
    event: 'ready';
    profile: { name: string; path: string };
    containers: unknown[];
    product?: string;
}

export interface ScreenshotResult {
    base64: string;
    encoding: string;
    mimeType: string;
    width?: number;
    height?: number;
    dpr?: number;
    byteLength?: number;
    path?: string;
}

export interface ViewportInfo {
    innerWidth: number;
    innerHeight: number;
    outerWidth?: number;
    outerHeight?: number;
    dpr: number;
    scrollX?: number;
    scrollY?: number;
}

export interface TabInfo {
    tabId?: number;
    id?: number;
    title?: string;
    url?: string;
    handle?: string;
    windowHandle?: string;
    cookieStoreId?: string;
    container?: string;
    active?: boolean;
    [key: string]: unknown;
}

type Pending = {
    resolve: (value: unknown) => void;
    reject: (err: Error) => void;
    timer: NodeJS.Timeout;
};

function resolveSkillDir(explicit?: string): string {
    if (explicit) return path.resolve(explicit);
    if (process.env.BLUE_STEEL_SKILL_DIR) return path.resolve(process.env.BLUE_STEEL_SKILL_DIR);

    const candidates = [
        path.resolve(__dirname, '../../../../skill'),
        path.resolve(process.cwd(), 'skill'),
        path.join(os.homedir(), '.agents/skills/blue-steel'),
    ];
    for (const c of candidates) {
        if (fs.existsSync(path.join(c, 'scripts/interactive_camoufox.py'))) return c;
    }
    return path.join(os.homedir(), '.agents/skills/blue-steel');
}

export class CamoufoxClient {
    private proc: ChildProcessWithoutNullStreams | null = null;
    private rl: Interface | null = null;
    private pending: Pending | null = null;
    private ready: CamoufoxReadyEvent | null = null;
    private started = false;
    private closed = false;
    private readonly logger: Logger;
    private readonly options: Required<
        Pick<CamoufoxClientOptions, 'commandTimeoutMs' | 'readyTimeoutMs' | 'headless' | 'profileName'>
    > & CamoufoxClientOptions;
    private readonly skillDir: string;
    private queue: Promise<unknown> = Promise.resolve();

    constructor(options: CamoufoxClientOptions = {}) {
        this.options = {
            commandTimeoutMs: options.commandTimeoutMs ?? 120_000,
            readyTimeoutMs: options.readyTimeoutMs ?? 120_000,
            headless: options.headless ?? false,
            profileName: options.profileName ?? process.env.BLUE_STEEL_PROFILE_NAME ?? 'blue-steel',
            ...options,
        };
        this.skillDir = resolveSkillDir(options.skillDir);
        this.logger = logger.child({ name: 'camoufox_client' });
    }

    getReady(): CamoufoxReadyEvent | null {
        return this.ready;
    }

    getSkillDir(): string {
        return this.skillDir;
    }

    async start(): Promise<CamoufoxReadyEvent> {
        if (this.started && this.ready) return this.ready;
        if (this.closed) throw new Error('CamoufoxClient is closed');

        const python =
            this.options.pythonPath ||
            process.env.BLUE_STEEL_PYTHON ||
            path.join(this.skillDir, '.venv/bin/python');
        const controller =
            this.options.controllerPath ||
            path.join(this.skillDir, 'scripts/interactive_camoufox.py');

        const pythonOk =
            python.includes(path.sep) || python.startsWith('.')
                ? fs.existsSync(python)
                : true; // bare command name (python3) — resolved via PATH
        if (!pythonOk) {
            throw new Error(
                `Blue Steel Camoufox python not found at ${python}. Run skill/scripts/bootstrap.sh first.`
            );
        }
        if (!fs.existsSync(controller)) {
            throw new Error(`BlueSteel controller not found at ${controller}`);
        }

        const args = ['-u', controller, '--profile-name', this.options.profileName];
        if (this.options.profile) args.push('--profile', this.options.profile);
        if (this.options.headless) args.push('--headless');
        if (this.options.noContainerProxy) args.push('--no-container-proxy');

        this.logger.info({ python, controller, args }, 'Starting Camoufox controller');

        this.proc = spawn(python, args, {
            stdio: ['pipe', 'pipe', 'pipe'],
            env: { ...process.env },
        });

        this.rl = createInterface({ input: this.proc.stdout });
        this.rl.on('line', (line) => this.onLine(line));
        this.proc.stderr.on('data', (buf: Buffer) => {
            const text = buf.toString('utf8').trim();
            if (text) this.logger.debug({ stderr: text }, 'controller stderr');
        });
        this.proc.on('exit', (code, signal) => {
            this.logger.info({ code, signal }, 'controller exited');
            this.failPending(new Error(`Camoufox controller exited (code=${code}, signal=${signal})`));
            this.closed = true;
            this.started = false;
        });

        this.ready = await this.waitForReady();
        this.started = true;
        return this.ready;
    }

    private waitForReady(): Promise<CamoufoxReadyEvent> {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error(`Camoufox controller ready timeout after ${this.options.readyTimeoutMs}ms`));
            }, this.options.readyTimeoutMs);

            const onReady = (event: CamoufoxReadyEvent) => {
                clearTimeout(timer);
                resolve(event);
            };

            (this as any)._onReady = onReady;
            (this as any)._onReadyReject = (err: Error) => {
                clearTimeout(timer);
                reject(err);
            };
        });
    }

    private onLine(line: string) {
        const trimmed = line.trim();
        if (!trimmed) return;
        let msg: any;
        try {
            msg = JSON.parse(trimmed);
        } catch {
            this.logger.warn({ line: trimmed }, 'non-json controller line');
            return;
        }

        if (msg.event === 'ready') {
            const ready = msg as CamoufoxReadyEvent;
            this.ready = ready;
            if ((this as any)._onReady) {
                (this as any)._onReady(ready);
                (this as any)._onReady = null;
            }
            return;
        }

        if (!this.pending) {
            this.logger.trace({ msg }, 'unsolicited controller message');
            return;
        }

        const pending = this.pending;
        this.pending = null;
        clearTimeout(pending.timer);

        if (msg.ok === false) {
            pending.reject(new Error(msg.error || 'Camoufox controller error'));
            return;
        }
        pending.resolve(msg.result);
    }

    private failPending(err: Error) {
        if ((this as any)._onReadyReject) {
            (this as any)._onReadyReject(err);
            (this as any)._onReadyReject = null;
            (this as any)._onReady = null;
        }
        if (this.pending) {
            clearTimeout(this.pending.timer);
            this.pending.reject(err);
            this.pending = null;
        }
    }

    async command<T = unknown>(op: string, params: Record<string, unknown> = {}): Promise<T> {
        const run = async (): Promise<T> => {
            if (!this.proc || !this.proc.stdin.writable) {
                throw new Error('Camoufox controller is not running');
            }
            if (this.pending) {
                throw new Error('Camoufox controller command overlap');
            }
            const payload = JSON.stringify({ op, ...params });
            return await new Promise<T>((resolve, reject) => {
                const timer = setTimeout(() => {
                    this.pending = null;
                    reject(new Error(`Camoufox op '${op}' timed out after ${this.options.commandTimeoutMs}ms`));
                }, this.options.commandTimeoutMs);
                this.pending = {
                    resolve: (v) => resolve(v as T),
                    reject,
                    timer,
                };
                this.proc!.stdin.write(payload + '\n');
            });
        };

        const result = this.queue.then(run, run);
        this.queue = result.then(
            () => undefined,
            () => undefined
        );
        return result;
    }

    // Convenience ops
    navigate(url: string) {
        return this.command<{ url: string; title: string; timedOut?: boolean }>('navigate', { url });
    }
    goBack() {
        return this.command<{ url: string; title: string }>('go_back');
    }
    status() {
        return this.command<{
            url: string;
            title: string;
            handle: string;
            handles: string[];
            profile: { name: string; path: string };
            viewport?: ViewportInfo;
        }>('status');
    }
    viewport() {
        return this.command<ViewportInfo>('viewport');
    }
    screenshotBase64() {
        return this.command<ScreenshotResult>('screenshot', { encoding: 'base64' });
    }
    html() {
        return this.command<string>('html');
    }
    eval<T = unknown>(script: string) {
        return this.command<T>('eval', { script });
    }
    mouseMove(x: number, y: number) {
        return this.command('mouse_move', { x, y });
    }
    mouseClick(x: number, y: number, button: 'left' | 'right' | 'middle' = 'left', count = 1) {
        return this.command('mouse_click', { x, y, button, count });
    }
    mouseDown(button: 'left' | 'right' | 'middle' = 'left', x?: number, y?: number) {
        return this.command('mouse_down', { button, ...(x !== undefined ? { x, y } : {}) });
    }
    mouseUp(button: 'left' | 'right' | 'middle' = 'left', x?: number, y?: number) {
        return this.command('mouse_up', { button, ...(x !== undefined ? { x, y } : {}) });
    }
    mouseDrag(x1: number, y1: number, x2: number, y2: number) {
        return this.command('mouse_drag', { x1, y1, x2, y2 });
    }
    mouseScroll(x: number, y: number, deltaX: number, deltaY: number) {
        return this.command('mouse_scroll', { x, y, deltaX, deltaY });
    }
    keysType(text: string, delayMs = 0) {
        return this.command('keys_type', { text, delay_ms: delayMs });
    }
    keysPress(key: string) {
        return this.command('keys_press', { key });
    }
    keysChord(keys: string[]) {
        return this.command('keys_chord', { keys });
    }
    tabs() {
        return this.command<TabInfo[] | { tabs: TabInfo[] }>('tabs');
    }
    switch(handle: string) {
        return this.command('switch', { handle });
    }
    open(url: string, container?: string) {
        return this.command('open', { url, ...(container ? { container } : {}) });
    }
    closeTab(tabId: number) {
        return this.command('close_tab', { tabId });
    }
    ensureContainer(name: string, color = 'blue', icon = 'fingerprint') {
        return this.command('ensure_container', { name, color, icon });
    }
    containers() {
        return this.command('containers');
    }
    cfStatus() {
        return this.command('cf_status');
    }
    cfSolve(opts: Record<string, unknown> = {}) {
        return this.command('cf_solve', opts);
    }
    isolateAccount(account: string, opts: Record<string, unknown> = {}) {
        return this.command('isolate_account', { account, ...opts });
    }
    openAccount(account: string, url: string) {
        return this.command('open_account', { account, url });
    }
    listAccounts() {
        return this.command('list_accounts');
    }
    proxyAssign(params: Record<string, unknown>) {
        return this.command('proxy_assign', params);
    }
    proxyDisable(container: string) {
        return this.command('proxy_disable', { container });
    }

    async quit(): Promise<void> {
        if (!this.proc || this.closed) return;
        try {
            await this.command('quit');
        } catch {
            // ignore
        }
        await this.stop();
    }

    async stop(): Promise<void> {
        this.closed = true;
        this.started = false;
        this.failPending(new Error('CamoufoxClient stopped'));
        if (this.rl) {
            this.rl.close();
            this.rl = null;
        }
        if (this.proc) {
            const proc = this.proc;
            this.proc = null;
            if (!proc.killed) {
                proc.kill('SIGTERM');
                await new Promise<void>((resolve) => {
                    const t = setTimeout(() => {
                        try { proc.kill('SIGKILL'); } catch { /* */ }
                        resolve();
                    }, 3000);
                    proc.on('exit', () => {
                        clearTimeout(t);
                        resolve();
                    });
                });
            }
        }
    }
}
