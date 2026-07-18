import { RegisteredTest, TestOptions } from "@/discovery/types";
import { TestResult, TestState } from "@/runner/state";
import { BrowserOptions, LLMClient } from "blue-steel-core";
import { parentPort, workerData } from "node:worker_threads";
import { isBun } from 'std-env';
import EventEmitter from "node:events";
import { TestFunction } from "@/discovery/types";

declare global {
    var __blueSteelTestFunctions: Map<string, TestFunction> | undefined;
    var __blueSteelMessageEmitter: EventEmitter | undefined;
    var __blueSteelTestHooks: TestHooks | undefined;
    var __blueSteelTestPromptStack: Record<string, string[]> | undefined;
    var __blueSteelTestRegistry: Map<string, TestMetadata> | undefined;
}

if (!globalThis.__blueSteelTestFunctions) {
    globalThis.__blueSteelTestFunctions = new Map<string, TestFunction>();
}
export const testFunctions = globalThis.__blueSteelTestFunctions;

if (!globalThis.__blueSteelMessageEmitter) {
    globalThis.__blueSteelMessageEmitter = new EventEmitter();
}
export const messageEmitter = globalThis.__blueSteelMessageEmitter;


export type TestHooks = Record<
    'beforeAll' | 'afterAll' | 'beforeEach' | 'afterEach',
    (() => void | Promise<void>)[]
>;

export type TestMetadata = {
    title: string;
    url: string;
    filepath: string;
    group?: string;
};

if (!globalThis.__blueSteelTestHooks) {
    globalThis.__blueSteelTestHooks = {
        beforeAll: [],
        afterAll: [],
        beforeEach: [],
        afterEach: [],
    };
}
export const hooks = globalThis.__blueSteelTestHooks;

if (!globalThis.__blueSteelTestPromptStack) {
    globalThis.__blueSteelTestPromptStack = {};
}
export const testPromptStack = globalThis.__blueSteelTestPromptStack;

if (!globalThis.__blueSteelTestRegistry) {
    globalThis.__blueSteelTestRegistry = new Map<string, TestMetadata>();
}
export const testRegistry = globalThis.__blueSteelTestRegistry;

export type TestWorkerIncomingMessage = {
    type: "execute"
    testId: string;
} | {
    type: "graceful_shutdown"
}

export type TestWorkerOutgoingMessage = {
    type: "load_complete";
} | {
    type: "load_error";
    error: string;
} | {
    type: "registered";
    test: RegisteredTest;
} | {
    type: "test_result";
    testId: string;
    result: TestResult;
} | {
    type: "test_error";
    testId: string;
    error: string;
} | {
    type: "test_state_change";
    testId: string;
    state: TestState;
} | {
    type: "graceful_shutdown_complete";
}

export function postToParent(message: TestWorkerOutgoingMessage) {
    if (isBun) {
        if (typeof process.send !== 'function') {
            throw new Error("Not running in a Bun subprocess with IPC");
        }
        process.send(message);
        return;
    }
    if (!parentPort) throw new Error("Not running in a worker thread");
    parentPort.postMessage(message);
}

export type TestWorkerData = {
    absoluteFilePath: string;
    options: TestOptions;
    relativeFilePath: string;
    browserOptions?: BrowserOptions;
    llm?: LLMClient | LLMClient[];
    telemetry?: boolean;
}

export function getTestWorkerData() {
    if (isBun) {
        const dataStr = process.env.BLUE_STEEL_WORKER_DATA;
        if (!dataStr) {
            throw new Error('Worker data not found in environment');
        }
        return JSON.parse(dataStr) as TestWorkerData;
    }
    if (!parentPort) {
        throw new Error('Do not use this module on the main thread');
    }
    return workerData as TestWorkerData;
}
