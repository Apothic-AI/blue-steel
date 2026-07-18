import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { WebServerConfig } from './discovery/types';

export async function isServerRunning(url: string): Promise<boolean> {
    try {
        await fetch(url, { method: 'HEAD' });
        return true;
    } catch {
        return false;
    }
}

export async function startWebServer(config: WebServerConfig): Promise<ChildProcess | null> {
    const { command, url, timeout = 60_000, reuseExistingServer = false } = config;

    if (reuseExistingServer && await isServerRunning(url)) {
        return null;
    }

    const child = spawn(command, { shell: true, stdio: 'inherit' });

    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
        if (await isServerRunning(url)) {
            return child;
        }
        await delay(500);
    }

    child.kill();
    throw new Error(`Timed out waiting for web server at ${url}`);
}

export function stopWebServer(proc: ChildProcess | null | undefined): void {
    if (proc) {
        proc.kill();
    }
}

export async function startWebServers(configs: WebServerConfig | WebServerConfig[]): Promise<(ChildProcess | null)[]> {
    if (Array.isArray(configs)) {
        const procs: (ChildProcess | null)[] = [];
        for (const config of configs) {
            procs.push(await startWebServer(config));
        }
        return procs;
    } else {
        return [await startWebServer(configs)];
    }
}

export function stopWebServers(procs: (ChildProcess | null | undefined)[]): void {
    for (const proc of procs) {
        stopWebServer(proc);
    }
}
