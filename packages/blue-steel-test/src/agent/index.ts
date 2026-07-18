import { BrowserAgent, AgentOptions, BrowserConnectorOptions, buildDefaultBrowserAgentOptions, AgentError, AgentEvents } from "blue-steel-core";
import z from "zod";
import EventEmitter from "eventemitter3";

export async function startTestCaseAgent(
    options: AgentOptions & BrowserConnectorOptions //StartAgentWithWebOptions = {}
): Promise<TestCaseAgent> {
    const { agentOptions, browserOptions } = buildDefaultBrowserAgentOptions({ agentOptions: options, browserOptions: options });

    const agent = new TestCaseAgent({
        agentOptions: agentOptions,
        browserOptions: browserOptions,
    });
    await agent.start();
    return agent;
}

const CHECK_INSTRUCTIONS=`
Given the actions of an LLM agent executing a test case, and a screenshot taken afterwards, evaluate whether the provided check "passes" i.e. holds true or not.

Check to evaluate:
`.trim();

interface TestCaseAgentOptions {

}

interface CheckEvents {
    'checkStarted': (check: string) => void;
    'checkDone': (check: string, passed: boolean) => void;
}

export class TestCaseAgent extends BrowserAgent {
    //public readonly events: EventEmitter<TestCaseAgentEvents>;
    public readonly checkEvents: EventEmitter<CheckEvents> = new EventEmitter();

    //declare public readonly events: EventEmitter<TestCaseAgentEvents>;
    
    //declare public readonly events: EventEmitter<TestCaseAgentEvents>;
    //public readonly events: EventEmitter<TestCaseAgentEvents> = new EventEmitter();

    // constructor(options: any /* your constructor options */) {
    //     super(options);

    //     // 3. Point this new property to the existing emitter from the parent.
    //     //    We cast `super.events` to tell TypeScript "Trust me, this emitter
    //     //    will also handle TestCaseAgentEvents". This is the one and only
    //     //    "lie" we have to tell the compiler to make everything else work.
    //     this.events = super.events as unknown as EventEmitter<TestCaseAgentEvents>;
    // }

    async check(description: string): Promise<void> {
        const instructions = CHECK_INSTRUCTIONS + `\n<check>${description}</check>`;

        this.checkEvents.emit('checkStarted', description);
    
        const response = await this.query(instructions, z.object({
            reasoning: z.string(),
            passed: z.boolean()
        }));
        
        this.memory.recordThought(response.reasoning);

        this.checkEvents.emit('checkDone', description, response.passed);

        if (!response.passed) throw new AgentError(`Check failed: ${description}`, { variant: 'check_failed' });
    }
}