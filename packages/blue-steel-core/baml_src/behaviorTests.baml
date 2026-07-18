
test DoNotOverplan1 {
    functions [CreatePartialRecipe]
    args {
        screenshot {
            url "https://blue-steel-test-screenshots.s3.us-east-1.amazonaws.com/do_not_overplan_1.png"
        }
        step {
            description #"Create a new company"#
            checks [
                #"Company added successfully"#
            ]
            testData {
                data [

                ]
                other #"Make up the first 2 values and use defaults for the rest"#
            }
        }
        previousActions [

        ]
    }
    @@assert( one_action, {{ this.actions|length == 1 }} )
    @@assert( not_marked_finished, {{ this.finished == false }} )
}


test DoNotOverplan2 {
    // Especially with the test data, planner might be tempted to click create company and also plan to fill form fields.
    // BUT we do not want it to do that - it should only click the button.
    functions [CreatePartialRecipe]
    args {
        screenshot {
            url "https://blue-steel-test-screenshots.s3.us-east-1.amazonaws.com/do_not_overplan_2.png"
        }
        step {
            description #"Create a new company"#
            checks [
                #"Company added successfully"#
            ]
            testData {
                data [

                ]
                other #"Make up the first 2 values and use defaults for the rest"#
            }
        }
        previousActions [
            #"
            {
                "variant": "click",
                "target": "Companies option in the left sidebar menu"
            }
            "#
        ]
    }
    @@assert( one_action, {{ this.actions|length == 1 }} )
    @@assert( not_marked_finished, {{ this.finished == false }} )
}

test OptimalPlanning1 {
    functions [CreatePartialRecipe]
    args {
        screenshot {
            url "https://blue-steel-test-screenshots.s3.us-east-1.amazonaws.com/do_not_underplan_1.png"
        }
        step {
            description #"Create a new company"#
            checks [
                #"Company added successfully"#
            ]
            testData {
                data [

                ]
                other #"Make up the first 2 values and use defaults for the rest"#
            }
        }
        previousActions [
        #"
            {
                "variant": "click",
                "target": "Companies option in the left sidebar menu"
            }
        "#,
        #"
            {
                "variant": "click",
                "target": "Add Company button in the top right corner"
            }
        "#
        ]
        
    }
    // optimal is type name, type domain, click save, mark finished
    @@assert( optimal_actions, {{ this.actions|length == 3 }} )
    // @@assert( not_marked_finished, {{ this.finished == false }} )
}



// test CheckContextRemove1 {
//     // Manual for now - ideally we'd want to verify that executor can check the returned description successfully
//     functions [RemoveImplicitCheckContext]
//     args {
//         screenshot {
//             url "https://blue-steel-test-screenshots.s3.us-east-1.amazonaws.com/check_context_remove_1.png"
//         }
//         check #"Company added successfully"#
//         previousActions [
//             #"
//                 {
//                     "variant": "click",
//                     "target": "Companies option in the left sidebar menu"
//                 }
//             "#,
//             #"
//                 {
//                     "variant": "click",
//                     "target": "'Add Company' button in the top right corner of the Companies page"
//                 }
//             "#,
//             #"
//                 {
//                     "variant": "type",
//                     "target": "Name input field",
//                     "content": "Acme Solutions"
//                 }
//             "#,
//             #"
//                 {
//                     "variant": "type",
//                     "target": "Domain input field",
//                     "content": "acmesolutions.com"
//                 }
//             "#,
//             #"
//                 {
//                     "variant": "type",
//                     "target": "Logo URL input field",
//                     "content": "https://example.com/image.jpg"
//                 }
//             "#,
//             #"
//                 {
//                     "variant": "type",
//                     "target": "Industry input field",
//                     "content": "Technology"
//                 }
//             "#,
//             #"
//                 {
//                     "variant": "click",
//                     "target": "Size dropdown menu"
//                 }
//             "#,
//             #"
//                 {
//                     "variant": "click",
//                     "target": "1-10 option in the Size dropdown"
//                 }
//             "#,
//             #"
//                 {
//                     "variant": "click",
//                     "target": "Revenue dropdown menu"
//                 }
//             "#,
//             #"
//                 {
//                     "variant": "click",
//                     "target": "<$100K option in the Revenue dropdown"
//                 }
//             "#,
//             #"
//                 {
//                     "variant": "click",
//                     "target": "ICP Fit dropdown menu"
//                 }
//             "#,
//             #"
//                 {
//                     "variant": "click",
//                     "target": "Medium option in the ICP Fit dropdown"
//                 }
//             "#,
//             #"
//                 {
//                     "variant": "click",
//                     "target": "Est. ARR dropdown menu"
//                 }
//             "#,
//             #"
//                 {
//                     "variant": "click",
//                     "target": "<$10K option in the Est. ARR dropdown"
//                 }
//             "#,
//             #"
//                 {
//                     "variant": "click",
//                     "target": "Connection Strength dropdown menu"
//                 }
//             "#,
//             #"
//                 {
//                     "variant": "click",
//                     "target": "Weak option in the Connection Strength dropdown"
//                 }
//             "#,
//             #"
//                 {
//                     "variant": "click",
//                     "target": "Save button"
//                 }
//             "#
//         ]
//     }
// }

test TargetGrounding1 {
    // This test is a screenshot of BlueSteel dasboard. Goal is to go to test playground.
    // Originally failed because target was described as "TC-0 Playground Test Case button"
    // This aligns more with the card shown rather that the specific button that actually needs to be clicked
    // which has text "Experiment Now (Free!)"
    // We want the planner to ground the targets in very specific details when available, such as the text on a button.
    // This test asserts that the generated target includes specific text from the button, at least "Experiment Now"
    functions [CreatePartialRecipe]
    args {
        screenshot {
            url "https://blue-steel-test-screenshots.s3.us-east-1.amazonaws.com/target_grounding_1.png"
        }
        step {
            description #"Go to test playground"#
            checks [
            ]
            testData {
                data [

                ]
                other ""
            }
        }
        previousActions [
        ]
    }
    @@assert( includes_button_text, {{ "Experiment Now (Free!)" in this.actions[0].target }} )
}