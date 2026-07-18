import { RegisteredTest } from "@/discovery/types";
import { TestState } from "@/runner/state";

export interface TestRenderer {
    start?(): void
    stop?(): void

    onTestStateUpdated(test: RegisteredTest, state: TestState): void
}
