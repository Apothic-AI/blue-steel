import { Agent, AgentOptions } from '.';
import { BrowserConnector, BrowserConnectorOptions } from '@/connectors/browserConnector';
import { buildDefaultBrowserAgentOptions } from '@/ai/util';
import { Schema, ZodSchema } from 'zod';
import z from 'zod';
import { narrateBrowserAgent } from './narrator';
import {
    PartitionOptions,
    partitionHtml,
    MarkdownSerializerOptions,
    serializeToMarkdown,
} from 'blue-steel-extract';
import EventEmitter from 'eventemitter3';
import { retry } from '@/common/retry';
import { WebHarness } from '@/web/harness';

const DEFAULT_BROWSER_AGENT_TEMP = 0.2;

export async function startBrowserAgent(
    options?: AgentOptions & BrowserConnectorOptions & { narrate?: boolean }
): Promise<BrowserAgent> {
    const { agentOptions, browserOptions } = buildDefaultBrowserAgentOptions({
        agentOptions: options ?? {},
        browserOptions: options ?? {},
    });

    const agent = new BrowserAgent({
        agentOptions: agentOptions,
        browserOptions: browserOptions,
    });

    if (options?.narrate || process.env.BLUE_STEEL_NARRATE) {
        narrateBrowserAgent(agent);
    }

    await agent.start();
    return agent;
}

type ExtractedOutput =
    | string
    | number
    | boolean
    | bigint
    | Date
    | null
    | undefined
    | { [key: string]: ExtractedOutput }
    | ExtractedOutput[];

export interface BrowserAgentEvents {
    nav: (url: string) => void;
    extractStarted: (instructions: string, schema: ZodSchema) => void;
    extractDone: (instructions: string, data: ExtractedOutput) => void;
}

async function getFullPageContent(harness: WebHarness): Promise<string> {
    // Expand same-origin iframes when possible, then return HTML.
    try {
        await harness.client.eval(`
            (function() {
              const iframes = Array.from(document.querySelectorAll('iframe'));
              for (const iframe of iframes) {
                try {
                  const doc = iframe.contentDocument;
                  if (!doc) continue;
                  const div = document.createElement('div');
                  div.innerHTML = doc.documentElement ? doc.documentElement.outerHTML : '';
                  div.dataset.expandedFromIframe = 'true';
                  div.dataset.iframeSrc = iframe.getAttribute('src') || '';
                  iframe.parentNode && iframe.parentNode.replaceChild(div, iframe);
                } catch (e) {
                  // cross-origin — skip
                }
              }
              return true;
            })();
        `);
    } catch {
        // ignore expansion failures
    }
    return await harness.getHtml();
}

export class BrowserAgent extends Agent {
    public readonly browserAgentEvents: EventEmitter<BrowserAgentEvents> = new EventEmitter();

    constructor({
        agentOptions,
        browserOptions,
    }: {
        agentOptions?: Partial<AgentOptions>;
        browserOptions?: BrowserConnectorOptions;
    }) {
        super({
            ...agentOptions,
            connectors: [new BrowserConnector(browserOptions || {}), ...(agentOptions?.connectors ?? [])],
        });
    }

    get harness(): WebHarness {
        return this.require(BrowserConnector).getHarness();
    }

    /** @deprecated Playwright Page is not available; use harness */
    get page(): never {
        throw new Error('BrowserAgent.page is unavailable under Camoufox. Use agent.harness or agent.nav/act/extract.');
    }

    /** @deprecated Playwright BrowserContext is not available */
    get context(): never {
        throw new Error('BrowserAgent.context is unavailable under Camoufox. Use agent.harness.');
    }

    async nav(url: string): Promise<void> {
        this.browserAgentEvents.emit('nav', url);
        await this.require(BrowserConnector).getHarness().navigate(url);
    }

    async extract<T extends Schema>(instructions: string, schema: T): Promise<z.infer<T>> {
        this.browserAgentEvents.emit('extractStarted', instructions, schema);
        const harness = this.require(BrowserConnector).getHarness();
        const htmlContent = await retry(async () => await getFullPageContent(harness), {
            retries: 5,
            delay: 200,
            exponential: true,
        });

        const partitionOptions: PartitionOptions = {
            extractImages: true,
            extractForms: true,
            extractLinks: true,
            skipNavigation: false,
            minTextLength: 3,
            includeOriginalHtml: false,
            includeMetadata: true,
        };

        const result = partitionHtml(htmlContent, partitionOptions);

        const markdownOptions: MarkdownSerializerOptions = {
            includeMetadata: false,
            includePageNumbers: true,
            includeElementIds: false,
            includeCoordinates: false,
            preserveHierarchy: true,
            escapeSpecialChars: true,
            includeFormFields: true,
            includeImageMetadata: true,
        };

        const markdown = serializeToMarkdown(result, markdownOptions);
        const screenshot = await harness.screenshot();
        const data = await this.models.extract(instructions, schema, screenshot, markdown);

        this.browserAgentEvents.emit('extractDone', instructions, data);
        return data;
    }

    async solveCloudflare(opts: Record<string, unknown> = {}) {
        return await this.harness.cfSolve(opts);
    }
}
