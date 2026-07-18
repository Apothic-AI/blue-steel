/**
 * Generates a unique identifier for a test case.
 * @param filepath - The path to the test file.
 * @param groupName - The name of the test group (or null if ungrouped).
 * @param title - The title of the test case.
 * @returns A unique string identifier.
 */
// export function getUniqueTestId(filepath: string, groupName: string | null, title: string): string {
//     const groupPart = groupName ? `[${groupName}]` : '__ungrouped__';
//     return `${filepath}::${groupPart}::${title}`;
// }

/**
 * Formats a duration in milliseconds into a human-readable string (e.g., "1.23s", "456ms").
 * @param ms - The duration in milliseconds.
 * @returns A formatted string representation of the duration.
 */
export function formatDuration(ms: number | undefined): string {
    if (ms === undefined || ms === null) {
        return '';
    }
    // if (ms < 1000) {
    //     return `${ms}ms`;
    // }
    //return `${(ms / 1000).toFixed(0)}s`;
    return `${(ms / 1000).toFixed(1)}s`;
}

// Note: initializeTestStates is likely not needed here as state is passed in.

// drawBox function removed as it's related to border drawing and not used by the current renderer.

// wrapText function removed as per user request.


/**
 * Creates the initial state object for all tests, marking them as pending.
 * @param tests - The categorized test cases discovered.
 * @returns An AllTestStates object with all tests set to 'pending'.
 */
// export function initializeTestStates(tests: CategorizedTestCases): AllTestStates {
//     // can we avoid having to do this?
//     const blankTestState: TestState = {
//         status: 'pending',
//         stepsAndChecks: [],
//         macroUsage: {
//             provider: '',
//             model: '',
//             inputTokens: 0,
//             outputTokens: 0,
//             numCalls: 0,
//         },
//         microUsage: {
//             provider: '',
//             numCalls: 0
//         }
//     }

//     const initialStates: AllTestStates = {};
//     for (const filepath of Object.keys(tests)) {
//         const { ungrouped, groups } = tests[filepath];
//         ungrouped.forEach(test => {
//             const testId = getUniqueTestId(filepath, null, test.title);
//             //initialStates[testId] = { status: 'pending' };
//             initialStates[testId] = blankTestState;
//         });
//         Object.entries(groups).forEach(([groupName, groupTests]) => {
//             groupTests.forEach(test => {
//                 const testId = getUniqueTestId(filepath, groupName, test.title);
//                 initialStates[testId] = blankTestState;
//             });
//         });
//     }
//     return initialStates;
// }
