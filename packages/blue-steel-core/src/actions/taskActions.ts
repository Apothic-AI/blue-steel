import { AgentError } from "@/agent/errors";
import { ActionDefinition, ActionPayload, createAction } from ".";
import { z } from "zod";

export const doneAction = createAction({
    name: 'task:done',
    description: "ONLY once you have seen sufficient evidence of the task's completion, mark it as done",//Use once sure that task is finished',//'Designate current task as finished',// Do not use until you can verify the task is completed.
    schema: z.object({
        evidence: z.string().describe(`Specific observed evidence that verifies the task's completion. Do NOT predict this evidence.`)
    }),
    resolver: async ({ agent }) => {
        agent.queueDone();
    },
    render: () => `✓ done`
});

export const failAction = createAction({
    name: 'task:fail',
    description: 'Use if task was attempted but does not seem possible. Use common sense',//'Designate current task as infeasible',
    schema: z.object({}),
    resolver: async ({ agent }) => {
        throw new AgentError(`Task failed: ${agent.memory.getLastThoughtMessage() ?? "No thought recorded"}`);
    },
    render: () => `✕ fail`
});

export const taskActions = [
    doneAction,
    failAction
] as const;
