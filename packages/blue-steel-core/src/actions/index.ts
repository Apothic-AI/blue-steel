import { Agent } from "@/agent"
import { RenderableContent } from "@/memory/observation";
import { z, Schema, ZodTypeAny } from "zod"

export interface ActionDefinition<T> {
    name: string;
    description?: string;
    schema: Schema<T>;
    resolver: ({ input, agent }: { input: T, agent: Agent }) => Promise<void | RenderableContent>;
    render: (action: T) => string
}

export function createAction<S extends ZodTypeAny>(
    action: {
        name: string;
        description?: string;
        schema?: S;
        resolver: ({ input, agent }: { input: z.infer<S>; agent: Agent }) => Promise<void | RenderableContent>;
        render?: (action: z.infer<S>) => string
    }
): ActionDefinition<z.infer<S>> {
    // Just a helper for automatic schema typing
    return {
        name: action.name,
        description: action.description,
        schema: action.schema ?? z.object({}),
        resolver: action.resolver,
        render: action.render ?? ((action) => JSON.stringify(action))
    };
}



// 2. Create a helper type to extract the payload structure for a single action
// This payload combines the 'name' (as a literal type) and the inferred schema.
export type ActionPayload<A extends ActionDefinition<any>> = { name: A['name'] } & z.infer<A['schema']>;

