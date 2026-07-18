// This file might become obsolete or significantly changed.
// For now, let's ensure AllTestStates uses the correct TestState from the runner.
import { TestState as RunnerTestState } from '@/runner/state';

// The local TestState and AgentState might not be needed anymore if
// all state comes directly from RunnerTestState.
// export interface AgentState {
//     // ... (original content)
// }

// export type TestState = {
//     status: 'pending' | 'running' | 'passed' | 'failed' | 'cancelled';
// } & AgentState;

export type AllTestStates = Record<string, RunnerTestState>;
