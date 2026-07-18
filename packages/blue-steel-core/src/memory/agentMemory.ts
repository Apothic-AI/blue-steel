import { 
    MultiMediaMessage
} from '@/ai/baml_client';
import { Observation, ObservationRetentionOptions, ObservationRole, ObservationSource } from './observation';
import z from 'zod';
import EventEmitter from 'eventemitter3';
import { jsonToObservableData, MultiMediaJson, observableDataToJson } from './serde';
import { applyMask, maskObservations } from './masking';
import { mergeMessages } from './util';
import { Image as BamlImage} from '@boundaryml/baml';

// export interface AgentMemoryEvents {
//     'thought': (thought: string) => void;
// }

export interface SerializedAgentMemory {
    instructions?: string;
    observations: {
        source: ObservationSource,
        role: ObservationRole,
        timestamp: number,
        data: MultiMediaJson,
        options?: ObservationRetentionOptions,
    }[];
}

export interface AgentMemoryOptions {
    instructions?: string | null,
    promptCaching?: boolean,
    thoughtLimit?: number, // TTL for thoughts
}

export interface MemoryRenderOptions {

}

// export interface FreezeState {
//     //lastFrozenObservationIndex: number,
//     // ^ just use length of mask
//     visibilityMask: boolean[],
// }

const CACHE_CONTROL_LIMIT = 3; // Anthropic allows max of 4, we use static one on system, 3 can be cyclic

export class AgentMemory {
    //public readonly events: EventEmitter<AgentMemoryEvents> = new EventEmitter();
    private options: Required<AgentMemoryOptions>;

    // Custom instructions relating to this memory instance (e.g. agent-level and/or task-level instructions)
    //public readonly instructions: string | null;

    private observations: Observation[] = [];

    //private freezeState?: FreezeState;
    private freezeMask?: boolean[];
    private cacheControlIndices: number[] = [];

    constructor(options?: AgentMemoryOptions) {
        //this.instructions = instructions ?? null;
        this.options = {
            instructions: options?.instructions ?? null,
            promptCaching: options?.promptCaching ?? false,
            //optimizeForPromptCaching: false,
            thoughtLimit: options?.thoughtLimit ?? 20
        };
    }

    public get instructions() {
        // why is this on memory? prob should just be on agent
        return this.options.instructions;
    }

    public async render(options?: MemoryRenderOptions): Promise<MultiMediaMessage[]> {
        if (this.options.promptCaching && this.cacheControlIndices.length >= CACHE_CONTROL_LIMIT) {
            this.freezeMask = undefined;
            this.cacheControlIndices = [];
        }
        const mask = await maskObservations(this.observations, this.freezeMask);

        const visibleObservations = applyMask(this.observations, mask);

        const lastVisible = visibleObservations.at(-1);
        if (lastVisible) this.cacheControlIndices.push(lastVisible.index); // index WRT full observation list
        
        let messages: MultiMediaMessage[] = [];
        for (const { observation, index } of visibleObservations) {
            const message = await observation.render({
                prefix: observation.source.startsWith('action:taken') || observation.source.startsWith('thought') ?
                    [`[${new Date(observation.timestamp).toTimeString().split(' ')[0]}]: `] : [],
                cacheControl: this.options.promptCaching && this.cacheControlIndices.includes(index)
            });
            messages.push(message);
        }
        
        if (this.options.promptCaching) {
            this.freezeMask = mask;   
        }

        return messages;
    }

    public async simpleRender(): Promise<(BamlImage | string)[]> {
        // Render with no filtering, no masking, no cache control
        //let messages: MultiMediaMessage[] = [];
        let content: (BamlImage | string)[] = [];
        for (const observation of this.observations) {
            const message = await observation.render({
                prefix: observation.source.startsWith('action:taken') || observation.source.startsWith('thought') ?
                    [`[${new Date(observation.timestamp).toTimeString().split(' ')[0]}]: `] : []
            });
            // ignore message stuff, just push content
            content = [...content, ...message.content];
        }
        return content;
    }

    public isEmpty(): boolean {
        return this.observations.length === 0;
    }

    public recordThought(content: string): void {
        this.observations.push(
            Observation.fromThought(content, { type: 'thought', limit: this.options.thoughtLimit })
        );
        //this.events.emit('thought', content);
    }

    public recordObservation(obs: Observation): void {
        this.observations.push(obs);
    }

    public getLastThoughtMessage(): string | null {
        for (let i = this.observations.length - 1; i >= 0; i--) {
            const obs = this.observations[i];
            // toString() is a little funky here, or the idea that thought might not just be text
            if (obs.source.startsWith('thought')) return obs.toString();
        }
        return null;
    }

    public async toJSON(): Promise<SerializedAgentMemory> {
        const observations = [];
        for (const observation of this.observations) {
            observations.push({
                source: observation.source,
                role: observation.role,
                timestamp: observation.timestamp,
                data: await observableDataToJson(observation.content),
                options: observation.retention,
            });
        }
        return {
            // TODO: include other options as well
            ...(this.options.instructions ? { instructions: this.options.instructions } : {}),
            observations: observations
        };
    }

    // TODO: turn into class static method / rework cons
    public async loadJSON(data: SerializedAgentMemory) {
        //jsonToObservableData(data);
        const observations = [];
        for (const observation of data.observations) {
            observations.push(new Observation(
                observation.source,
                observation.role,
                await jsonToObservableData(observation.data),
                observation.options,
                observation.timestamp
            ));
            
        }
        // nvm
        //this.instructions = this.instructions;

        this.observations = observations;


        // return {
        //     ...(this.instructions ? { instructions: this.instructions } : {}),
        //     observations: observations
        // };
    }
}
