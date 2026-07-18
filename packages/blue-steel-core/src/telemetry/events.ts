import type { Agent } from "@/agent";
import type { BrowserAgent } from "@/agent/browserAgent";
import { LLMClientIdentifier, ModelUsage } from "@/ai/types";
import { createId, sendTelemetry } from "@/telemetry";


export type UsageReport = {
    llm: LLMClientIdentifier,
    inputTokens: number,
    outputTokens: number,
    numCalls: number
}[]

// kinda jank
function addUsageToReport(report: UsageReport, usage: ModelUsage) {
    const modelHash = JSON.stringify(usage.llm);
    let exists = false;
    for (const entry of report) {
        const compare = JSON.stringify(usage.llm);
        if (modelHash === compare) {
            // merge with existing usage
            exists = true;
            entry.inputTokens += usage.inputTokens;
            entry.outputTokens += usage.outputTokens;
            entry.numCalls += 1;
        }
    }
    if (!exists) {
        report.push({ ...usage, numCalls: 1 })
    }
}

export function telemetrifyAgent(agent: Agent) {
    // Generate ID here that will be used to represent this agent in all telemetry events
    const agentId = createId();

    agent.events.on('start', async () => {
        await sendTelemetry('agent-start', { agentId }); 
    });

    agent.events.on('stop', async () => {
        await sendTelemetry('agent-stop', { agentId }); 
    });

    agent.events.on('actStarted', async () => {
        const startedAt = Date.now();
        const report: UsageReport = [];
        let actionCount = 0;
        const tokenListener = (usage: ModelUsage) => {
            addUsageToReport(report, usage);
        }
        agent.events.on('tokensUsed', tokenListener);
        const actionListener = () => {
            actionCount++;
        }
        agent.events.on('actionDone', actionListener);

        agent.events.once('actDone', async () => {
            agent.events.removeListener('tokensUsed', tokenListener);
            agent.events.removeListener('actionDone', actionListener);
            const doneAt = Date.now();

            await sendTelemetry('agent-act', {
                agentId,
                startedAt,
                doneAt,
                actionCount,
                modelUsage: report,
            });
        });
    });

    //if (agent instanceof BrowserAgent) {
    if (agent.hasOwnProperty('browserAgentEvents')) {
        // Report nav and extract telemetry if browser agent
        const browserAgent = agent as BrowserAgent;

        browserAgent.browserAgentEvents.on('nav', async () => {
            await sendTelemetry('agent-nav', { agentId }); 
        });

        browserAgent.browserAgentEvents.on('extractStarted', async () => {
            const startedAt = Date.now();
            const report: UsageReport = [];
            const tokenListener = (usage: ModelUsage) => {
                addUsageToReport(report, usage);
            }
            browserAgent.events.on('tokensUsed', tokenListener);

            browserAgent.browserAgentEvents.once('extractDone', async () => {
                browserAgent.events.removeListener('tokensUsed', tokenListener);
                const doneAt = Date.now();

                await sendTelemetry('agent-extract', {
                    agentId,
                    startedAt,
                    doneAt,
                    modelUsage: report,
                });
            });
        });
    }
}