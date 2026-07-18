
// class FailureClassification {
//     classification "bug" | "misalignment"
// }

class BugFailureClassification {
    reasoning string
    classification "bug"
    title string
    expectedResult string
    actualResult string
    severity "critical" | "high" | "medium" | "low"
}

class MisalignmentClassification {
    reasoning string
    classification "misalignment"

    fault "test" | "agent" @description(#"
        Is this likely a problem with the test case or some issue with the agent?
    "#)
    
    message string @description(#"
        If fault of test case:
        Message to the developer who wrote the test case to help them understand what may have happened and how they might be able to fix it.
        Be simple, direct, and informative.
        If fault of agent:
        Message to the developer who wrote the test case (not the person who wrote the agent) to help them understand what may have happened, and suggest possible ways to adjust the test case to accommodate the issue.
    "#)
}

// class FailureClassification {
//     reasoning
//     classification "bug" | "misalignment"
// }

template_string BaseMeta #"
    You are observing the execution of an LLM agent that runs test cases.
    This agent executes test cases by observing screenshots from the browser, acting out steps, and verifying checks.
"#

// should this be given the original or adjusted check?
// should this be given more ctx of the overall step or test case?
// this is a tricky prompt, but its not as critical to get right as others
// it does become more important if we rely on classify as bug/misalign then correct minor misaligns only if not bug
// ^ if we need this then we should think of a more isolated/logical prompt to detect misalignments
// function ClassifyCheckFailure (context: BrowserExecutionContext, check: string) -> BugFailureClassification | MisalignmentClassification {
//     client SonnetAnthropic
//     prompt #"
//         {{ _.role("system") }}
//         {{ BaseMeta() }}

//         The agent just marked a check as failed. Your job is to figure out why.

//         Either:
//         (1) The web application actually has a bug in it
//         or
//         (2) There's some misalignment between the test case and what is in the interface

//         If there is a bug, please break it down in detail.
//         If it is a misalignment, please describe what you think happened.

//         Use the provided history of actions the agent took as well as the most recent screenshot to help you identify what happened.

//         {{ ctx.output_format }}

//         {{ _.role("user") }}

//         The "check" that was marked as failed:
//         {{ check }}

//         {{ DescribeBrowserExecutionContext(context) }}
//     "#
// }

// function DiagnoseTargetNotFound (screenshot: image, step: TestStep, target: string, previousActions: string[]) -> BugFailureClassification | MisalignmentClassification {
//     client SonnetAnthropic
//     prompt #"
//         {{ _.role("system") }}
//         {{ BaseMeta() }}

//         The agent had an issue acting out a step because it could not find a target. Your job is to figure out why.

//         Either:
//         (1) The web application actually has a bug in it
//         or
//         (2) There's some misalignment between the test case and what is in the interface

//         If there is a bug, please break it down in detail.
//         If it is a misalignment, please describe what you think happened.

//         Use the provided history of actions the agent took as well as the most recent screenshot to help you identify what happened.

//         {{ ctx.output_format }}

//         {{ _.role("user") }}

//         The history of previous actions:
//         {%if previousActions %}
//         (there are none)
//         {%endif%}
//         {%for action in previousActions%}
//         {{ action }}
//         {%endfor%}
        
//         The step that failed: <step>{{ step.description }}</step>
//         Target that could not be found: <target>{{ target }}</target>
        

//         Current screenshot:
//         {{screenshot}}
//     "#
// }