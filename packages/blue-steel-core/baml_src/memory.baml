// BamlImage class is assumed to be defined and available from your BAML setup
// For example, it might be part of a core BAML library or generated separately.
// If not, you might need to define it or import it if it's in another baml file.
// For now, we assume 'Image' is a known type to BAML.

// class BamlThought {
//   variant "thought"
//   timestamp string
//   message string
// }

// class BamlTurn {
//   variant "turn"
//   timestamp string
//   action string 
//   content (string | image)[] // multimedia content "chunks"
// }


// class Observation {
//     source string
//     content (string | image)[] // multimedia content "chunks"
// }

class ConnectorInstructions {
    connectorId string
    instructions string
    //content (string | image)[]
}

class AgentContext {
    instructions string? // additional task-level or agent-level instructions
    //history (BamlThought | BamlTurn)[]
    //observations Observation[]
    //observationContent (string | image)[] // complete rendered observation content as multimedia content "chunks"
    observationContent MultiMediaMessage[]
    //currentTimestamp string
    connectorInstructions ConnectorInstructions[]
}
