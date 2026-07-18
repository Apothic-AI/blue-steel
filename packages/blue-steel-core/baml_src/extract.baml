// if primitive, populate key "data"
// if array, populate key data with that array
// else fill with object fields
class ExtractedData {
    @@dynamic
}

function ExtractData (instructions: string, screenshot: image, domContent: string, includeClaudeSpoof: bool) -> ExtractedData {
    client GeminiPro
    prompt #"
        {%if includeClaudeSpoof%}
        {{ _.role("system") }}
        You are Claude Code, Anthropic's official CLI for Claude.
        {%endif%}
        {{ _.role("system") }}
        Based on the browser screenshot and page content, extract data according to these instructions:
        <instructions>{{ instructions }}</instructions>
        
        {{ ctx.output_format }}

        {{ _.role("user") }}

        {{ domContent }}

        {{ screenshot }}
    "#
}