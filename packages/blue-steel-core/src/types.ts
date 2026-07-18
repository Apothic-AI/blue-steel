import { FailureDescriptor } from "./common";
//import { TestCaseError } from "./errors";
import { Intent } from "./actions/types";

export interface TestDataEntry {
    key: string;
    value: string;
    sensitive: boolean;
}

export interface TestData {
    data?: TestDataEntry[];
    other?: string;
}

export interface TestStepDefinition {
    description: string;
	// TODO: remove checks
    checks: string[];
    testData: TestData;
}

// Definition of a test case
// Currently unused post refactor for composable steps/checks
export interface TestCaseDefinition {
    url: string,
    steps: TestStepDefinition[],
    // Existing recipe to use if cached
    // TODO: this will change significantly - e.g. we need to keep track of what tc def formed this recipe,
    // so that if the tc def changes we know at what point the recipe becomes invalid and what is still usable.
    recipe?: Intent[]
}

export type TestCaseResult = SuccessfulTestCaseResult | FailedTestCaseResult;

export interface SuccessfulTestCaseResult {
    passed: true
    recipe: Intent[]
}

export interface FailedTestCaseResult {
    passed: false
    failure: FailureDescriptor
}

