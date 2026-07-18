import logger from '@/logger';
import { TestFailure, TestState } from '@/runner/state';
import { getCodebaseId, getMachineId, LLMClientIdentifier, posthog } from 'blue-steel-core';
import { VERSION } from '@/version';

export interface TelemetryPayload {
    source: 'blue-steel-test',
	telemetryVersion: string, // telemetry payload version will prob be nice in the future
    packageVersion: string,
    codebase?: string, // unique value derived from git hash if available
	startedAt: number, // timestamp
	doneAt: number, // timestamp
    numSteps: number,
    numChecks: number,
	browserActionCount: number, // number of web actions taken
    modelUsage: {
        llm: LLMClientIdentifier,
        inputTokens: number,
        outputTokens: number,
        numCalls: number
    }[],
    passed: boolean,
    failure?: TestFailure
};

// For reference
export interface V1TelemetryPayload {
	version: string,
	userId: string,
	startedAt: number,
	doneAt: number,
	cached: boolean,
	testCase: {
		numSteps: number,
		numChecks: number
	},
	actionCount: number,
	macroUsage: {
		provider: string,
		model: string,
		inputTokens: number,
		outputTokens: number,
		numCalls: number
	}
	microUsage: {
		provider: string,
		numCalls: number
	},
	result: string // e.g. 'passed' | 'bug' | 'misalignment'
};


export async function sendTelemetry(state: TestState) {
    // const fullPayload: V1TelemetryPayload = {
    //     version: '0.1',
    //     userId: getMachineId(),
    //     ...payload
    // }
    // const jsonString = JSON.stringify(fullPayload);
    // const encodedData = btoa(jsonString);
    // const telemetryUrl = "https://telemetry.blue-steel.run/functions/v1/telemetry?data=" + encodedData;

    // Transformations needed:
    // 1. Count steps and checks
    // 2. Count number of web actions

    let numSteps: number = 0;
    let numChecks: number = 0;
    let browserActionCount: number = 0;

    for (const item of state.stepsAndChecks) {
        if (item.variant === 'step') {
            numSteps += 1;
            for (const action of item.actions) {
                if (action.action.variant.startsWith("browser") || action.action.variant.startsWith("keyboard") || action.action.variant.startsWith("mouse")) {
                    browserActionCount += 1;
                }
            }
        } else {
            numChecks += 1;
        }
    }

    const userId = getMachineId();
    const codebaseId = getCodebaseId();

    if (codebaseId) {
        try {
            posthog.groupIdentify({
                groupType: 'codebase',
                groupKey: codebaseId,
                //properties: {}
            });
        } catch (error) {
            logger.warn(`Failed to identify group: ${(error as Error).message}`);
        }
    }

    const payload: TelemetryPayload = {
        source: 'blue-steel-test',
        telemetryVersion: '0.2',
        packageVersion: VERSION,
        codebase: codebaseId,
        startedAt: state.startedAt ?? Date.now(),
        doneAt: state.doneAt ?? Date.now(),
        numSteps: numSteps,
        numChecks: numChecks,
        browserActionCount: browserActionCount,
        modelUsage: state.modelUsage,
        passed: state.status === 'passed',
        failure: state.failure
    }
    // console.log("user ID:", userId);
    // console.log("codebase ID:", codebaseId);
    
    try {
        // const resp = await fetch(telemetryUrl, { signal: AbortSignal.timeout(3000) });
        // if (!resp.ok) {
        //     logger.warn(`Failed to send telemetry (status ${resp.status})`);
        // }
        posthog.capture({
            distinctId: userId,
            event: 'test-run',
            properties: {
                ...payload
            },
            ...(codebaseId ? { groups: { codebase: codebaseId }} : {})
            // groups: {
            //     // TODO: derive from git hash (also put it payload too)
            //     codebase: codebaseId
            // }
        });
        // does NOT wait for HTTP request to fully finish so still need client.shutdown somewhere
        //await posthog.flush();
        // shutdown waits for http request to actually finish. ideally would do this per suite instead?
        await posthog.shutdown();
    } catch (error) {
        logger.warn(`Failed to send telemetry (may have timed out): ${(error as Error).message}`);
    }
}
