import { BrowserOptions, LLMClient } from "blue-steel-core";
import { TestCaseAgent } from "@/agent";

export interface TestOptions {
    url?: string;
    prompt?: string;
}

export interface WebServerConfig {
    command: string;
    url: string;
    timeout?: number;
    reuseExistingServer?: boolean;
}

export type BlueSteelConfig = {
    url: string;
    llm?: LLMClient | LLMClient[];
    webServer?: WebServerConfig | WebServerConfig[];
    browser?: BrowserOptions;
    telemetry?: boolean;
    continueAfterFailure?: boolean;
    display?: {
        showActions?: boolean;
        showThoughts?: boolean;
    };
};

export type TestFunction = (agent: TestCaseAgent) => Promise<void>;
export type TestGroupFunction = () => void;

export interface TestGroup {
    name: string;
    options?: TestOptions;
}

export interface TestGroupDeclaration {
    (id: string, options: TestOptions, groupFn: TestGroupFunction): void;
    (id: string, groupFn: TestGroupFunction): void;
}

export interface TestDeclaration {
    (title: string, options: TestOptions, testFn: TestFunction): void;
    (title: string, testFn: TestFunction): void;
    group: TestGroupDeclaration;
}

export interface RegisteredTest {
    id: string;
    title: string;
    url: string;
    filepath: string;
    group?: string;
}

export type { BrowserOptions };
