import { TestRenderer } from "@/renderer";
import { RegisteredTest, BlueSteelConfig } from "@/discovery/types";
import { TestState } from "@/runner/state";
import { AllTestStates } from "./types"; // Import AllTestStates directly
import * as uiState from './uiState';
import { scheduleRedraw, redraw } from './uiRenderer';
import { describeModel } from '@/util'; // Import describeModel
// Import other necessary types and functions from term-app/index, term-app/util etc. as needed
// For now, let's assume logUpdate might be used directly or indirectly
import logUpdate from 'log-update';
// import { MAX_APP_WIDTH } from "./constants"; // No longer used

// Functions that might be moved or adapted from term-app/index.ts
// For now, keep them here or ensure they are imported if they remain in index.ts
// and are exported.
// We'll need to handle SIGINT and resize eventually.

export class TermAppRenderer implements TestRenderer {
    private blueSteelConfig: BlueSteelConfig;
    private initialTests: RegisteredTest[];
    private firstModelReportedInUI = false; // New flag

    // To manage SIGINT listener
    private sigintListener: (() => void) | null = null;

    private applyDisplaySettings(): void {
        const newSettings = { ...uiState.renderSettings };
        if (this.blueSteelConfig.display?.showActions !== undefined) {
            newSettings.showActions = this.blueSteelConfig.display.showActions;
        }
        if (this.blueSteelConfig.display?.showThoughts !== undefined) {
            newSettings.showThoughts = this.blueSteelConfig.display.showThoughts;
        }
        uiState.setRenderSettings(newSettings);
    }

    constructor(config: BlueSteelConfig, initialTests: RegisteredTest[]) {
        this.blueSteelConfig = config;
        this.initialTests = [...initialTests]; // Store a copy

        // Initial setup based on config, if needed immediately
        this.applyDisplaySettings();
        uiState.setCurrentModel(""); // Set to blank
        // uiState.setAllRegisteredTests will be called in start() after resetState()
    }

    public start(): void {
        process.stdout.write('\n'); // Ensure output starts on a new line
        uiState.resetState(); // Reset all UI state

        // Re-apply initial settings after reset
        this.applyDisplaySettings();
        // uiState.setCurrentModel(""); // No longer needed here, resetState handles it.
        this.firstModelReportedInUI = false; // Reset flag on start
        uiState.setAllRegisteredTests(this.initialTests); // Set the tests

        // Initialize currentTestStates for all tests to 'pending'
        const initialTestStates: AllTestStates = {}; // Use direct import
        for (const test of this.initialTests) {
            initialTestStates[test.id] = {
                status: 'pending', // Add initial status
                stepsAndChecks: [],
                modelUsage: [],
                // macroUsage: { provider: '', model: '', inputTokens: 0, outputTokens: 0, numCalls: 0 },
                // microUsage: { provider: '', numCalls: 0 },
            };
        }
        uiState.setCurrentTestStates(initialTestStates);
        uiState.setElapsedTimes({}); // Clear elapsed times

        // process.stdout.write('\n'); // Removed unnecessary newline
        // logUpdate.clear(); // Removed screen clearing
        // process.stdout.write('\x1b[2J\x1b[H'); // Removed screen clearing

        // Setup event listeners
        this.sigintListener = this.handleExitKeyPress.bind(this);

        process.on('SIGINT', this.sigintListener);
        
        // Start the timer interval (adapted from original initializeUI)
        if (!uiState.timerInterval) {
            const interval = setInterval(() => {
                if (uiState.isFinished) {
                    clearInterval(uiState.timerInterval!);
                    uiState.setTimerInterval(null);
                    return;
                }
                let runningTestsExist = false;
                uiState.setSpinnerFrame((uiState.spinnerFrame + 1) % uiState.spinnerChars.length);
                
                Object.entries(uiState.currentTestStates).forEach(([testId, state]) => {
                    // Assuming TestState from runner will have a 'status' field
                    // For now, we need to check if the state itself implies running
                    // This part will be more robust once TestState includes status directly
                    // Now we can use the explicit status
                    const liveState = state as TestState; // Cast to full TestState from runner/state
                    if (liveState.status === 'running') {
                        runningTestsExist = true;
                        // Ensure startedAt is set if running, though TestStateTracker should handle this
                        if (liveState.startedAt) {
                             uiState.updateElapsedTime(testId, Date.now() - liveState.startedAt);
                        } else {
                            // This case should ideally not happen if TestState is correctly managed
                            // uiState.updateElapsedTime(testId, 0); 
                        }
                    }
                });
                if (runningTestsExist && !uiState.redrawScheduled) { // Only schedule if not already scheduled
                    scheduleRedraw(); // Direct call
                }
            }, 100);
            uiState.setTimerInterval(interval);
        }

        scheduleRedraw(); // Initial draw - Direct call
    }

    public stop(): void {
        if (uiState.isFinished) return; // Prevent double cleanup
        uiState.setIsFinished(true);

        if (uiState.timerInterval) {
            clearInterval(uiState.timerInterval);
            uiState.setTimerInterval(null);
        }

        // Remove event listeners
        if (this.sigintListener) {
            process.removeListener('SIGINT', this.sigintListener);
            this.sigintListener = null;
        }

        redraw(); // Last draw to reflect final state
        // logUpdate.done(); // Responsibility moved to redraw() when isFinished is true
        // process.stderr.write('\n'); // Also moved to redraw()
        // DO NOT call process.exit() here
    }

    public onTestStateUpdated(test: RegisteredTest, newState: TestState): void {
        const currentStates = { ...uiState.currentTestStates };
        const testId = test.id;

        // Merge new state into existing state for the test
        // Ensure startedAt is preserved if already set and newState doesn't have it
        const existingState = currentStates[testId] || {};
        const updatedTestState = {
            ...existingState,
            ...newState,
            startedAt: newState.startedAt || existingState.startedAt,
         };
        currentStates[testId] = updatedTestState;
        
        uiState.setCurrentTestStates(currentStates);

        // New logic to detect and set the first model for the UI
        if (!this.firstModelReportedInUI &&
            newState.modelUsage &&
            newState.modelUsage.length > 0) {
            
            const firstModelEntry = newState.modelUsage[0];
            let modelNameToReport: string | undefined = undefined;

            if (firstModelEntry && firstModelEntry.llm) {
                modelNameToReport = describeModel(firstModelEntry.llm);
            }

            if (modelNameToReport) {
                uiState.setCurrentModel(modelNameToReport);
                this.firstModelReportedInUI = true;
            }
        }

        // Handle startedAt and elapsedTimes
        if (updatedTestState.startedAt && !updatedTestState.doneAt) { // Test is running or just started
            if (!uiState.elapsedTimes[testId] || uiState.elapsedTimes[testId] === 0) {
                 // If it just started, set elapsed time to 0 or based on current time
                uiState.updateElapsedTime(testId, Date.now() - updatedTestState.startedAt);
            }
        } else if (updatedTestState.startedAt && updatedTestState.doneAt) { // Test finished
            uiState.updateElapsedTime(testId, updatedTestState.doneAt - updatedTestState.startedAt);
        }
        
        scheduleRedraw(); // Direct call
    }

    // onResize method removed as per user request.

    // Adapted from term-app/index.ts
    private handleExitKeyPress(): void {
        // No longer distinguish between isFinished, just trigger stop
        this.stop(); 
        // The TestSuiteRunner or CLI will handle actual process exit if needed after stop() completes.
        // Forcing an exit here might preempt cleanup or final reporting.
        // A second SIGINT will terminate if stop() doesn't lead to exit.
    }
}
