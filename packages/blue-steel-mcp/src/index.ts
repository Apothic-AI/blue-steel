#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { WebHarness, CamoufoxClient } from 'blue-steel-core';
import * as path from 'path';
import { homedir } from 'os';

const config = {
    skillDir: process.env.BLUE_STEEL_SKILL_DIR || path.join(homedir(), '.agents/skills/blue-steel'),
    profileName: process.env.BLUE_STEEL_MCP_PROFILE || process.env.BLUE_STEEL_PROFILE_NAME || 'blue-steel',
    headless: process.env.BLUE_STEEL_MCP_HEADLESS === '1',
};

const ClickActionSchema = z.object({
    type: z.literal('click'),
    x: z.number(),
    y: z.number()
});
const RightClickActionSchema = z.object({
    type: z.literal('right_click'),
    x: z.number(),
    y: z.number()
});
const DoubleClickActionSchema = z.object({
    type: z.literal('double_click'),
    x: z.number(),
    y: z.number()
});
const TypeActionSchema = z.object({
    type: z.literal('type'),
    x: z.number(),
    y: z.number(),
    content: z.string()
});
const DragActionSchema = z.object({
    type: z.literal('drag'),
    x1: z.number(),
    y1: z.number(),
    x2: z.number(),
    y2: z.number()
});
const ScrollActionSchema = z.object({
    type: z.literal('scroll'),
    x: z.number(),
    y: z.number(),
    deltaX: z.number(),
    deltaY: z.number()
});
const SwitchTabActionSchema = z.object({
    type: z.literal('switch_tab'),
    index: z.number()
});
const NewTabActionSchema = z.object({
    type: z.literal('new_tab'),
    url: z.string().optional(),
    container: z.string().optional()
});
const NavigateActionSchema = z.object({
    type: z.literal('navigate'),
    url: z.string()
});
const KeyPressActionSchema = z.object({
    type: z.literal('keypress'),
    key: z.enum(['Enter', 'Tab', 'Backspace'])
});
const CfSolveActionSchema = z.object({
    type: z.literal('cf_solve'),
    timeout: z.number().optional()
});

const ActionSchema = z.discriminatedUnion('type', [
    ClickActionSchema,
    RightClickActionSchema,
    DoubleClickActionSchema,
    TypeActionSchema,
    DragActionSchema,
    ScrollActionSchema,
    SwitchTabActionSchema,
    NewTabActionSchema,
    NavigateActionSchema,
    KeyPressActionSchema,
    CfSolveActionSchema,
]);

const ConnectBrowserSchema = z.object({
    url: z.string().optional(),
    container: z.string().optional(),
    profileName: z.string().optional(),
    headless: z.boolean().optional(),
});

const ActSchema = z.object({
    actions: z.array(ActionSchema)
});

let client: CamoufoxClient | null = null;
let harness: WebHarness | null = null;

async function getCurrentState() {
    if (!harness) throw new Error('No browser connected');
    const tabState = await harness.retrieveTabState();
    const screenshot = await harness.screenshot();
    const base64 = await screenshot.toBase64();
    return { tabs: tabState, screenshot: base64 };
}

const server = new Server(
    { name: 'blue-steel-mcp', version: '0.1.0' },
    { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: 'open_browser',
                description: 'Open Camoufox browser with BlueSteel persistent profile.',
                inputSchema: zodToJsonSchema(ConnectBrowserSchema),
            },
            {
                name: 'act',
                description: 'Perform coordinate actions in the browser (click/type/scroll/tabs/CF solve).',
                inputSchema: zodToJsonSchema(ActSchema),
            },
            {
                name: 'screenshot',
                description: 'Get current browser state (tabs and screenshot)',
                inputSchema: { type: 'object', properties: {} },
            },
            {
                name: 'cf_solve',
                description: 'Solve Cloudflare Turnstile challenge if present',
                inputSchema: zodToJsonSchema(z.object({ timeout: z.number().optional() })),
            },
        ],
    };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
        switch (name) {
            case 'open_browser': {
                const parsed = ConnectBrowserSchema.parse(args || {});
                if (harness) await harness.stop();
                if (client) await client.quit();
                client = null;
                harness = null;

                client = new CamoufoxClient({
                    skillDir: config.skillDir,
                    profileName: parsed.profileName || config.profileName,
                    headless: parsed.headless ?? config.headless,
                });
                await client.start();
                harness = new WebHarness(client, {
                    virtualScreenDimensions: { width: 1024, height: 768 },
                });
                await harness.start();

                const startUrl = parsed.url || 'https://www.google.com';
                if (parsed.container) {
                    await harness.openInContainer(startUrl, parsed.container);
                } else {
                    await harness.navigate(startUrl);
                }

                const state = await getCurrentState();
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Browser opened (Camoufox/BlueSteel)\n\nTabs:\n${JSON.stringify(state.tabs, null, 2)}`,
                        },
                        { type: 'image', data: state.screenshot, mimeType: 'image/png' },
                    ],
                };
            }
            case 'act': {
                if (!harness) throw new Error('No browser connected. Use open_browser first.');
                const parsed = ActSchema.parse(args);
                for (const action of parsed.actions) {
                    switch (action.type) {
                        case 'click':
                            await harness.click({ x: action.x, y: action.y });
                            break;
                        case 'right_click':
                            await harness.rightClick({ x: action.x, y: action.y });
                            break;
                        case 'double_click':
                            await harness.doubleClick({ x: action.x, y: action.y });
                            break;
                        case 'type':
                            await harness.clickAndType({
                                x: action.x,
                                y: action.y,
                                content: action.content,
                            });
                            break;
                        case 'drag':
                            await harness.drag({
                                x1: action.x1,
                                y1: action.y1,
                                x2: action.x2,
                                y2: action.y2,
                            });
                            break;
                        case 'scroll':
                            await harness.scroll({
                                x: action.x,
                                y: action.y,
                                deltaX: action.deltaX,
                                deltaY: action.deltaY,
                            });
                            break;
                        case 'switch_tab':
                            await harness.switchTab({ index: action.index });
                            break;
                        case 'new_tab':
                            await harness.newTab(action.url, action.container);
                            break;
                        case 'navigate':
                            await harness.navigate(action.url);
                            break;
                        case 'keypress':
                            if (action.key === 'Enter') await harness.enter();
                            else if (action.key === 'Tab') await harness.tab();
                            else if (action.key === 'Backspace') await harness.backspace();
                            break;
                        case 'cf_solve':
                            await harness.cfSolve({ timeout: action.timeout ?? 30 });
                            break;
                        default:
                            throw new Error(`Unknown action type: ${(action as any).type}`);
                    }
                }
                await harness.waitForStability();
                const state = await getCurrentState();
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Actions executed: ${parsed.actions.length}\n\nCurrent tabs:\n${JSON.stringify(state.tabs, null, 2)}`,
                        },
                        { type: 'image', data: state.screenshot, mimeType: 'image/png' },
                    ],
                };
            }
            case 'screenshot': {
                const state = await getCurrentState();
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Current tabs:\n${JSON.stringify(state.tabs, null, 2)}`,
                        },
                        { type: 'image', data: state.screenshot, mimeType: 'image/png' },
                    ],
                };
            }
            case 'cf_solve': {
                if (!harness) throw new Error('No browser connected');
                const parsed = z.object({ timeout: z.number().optional() }).parse(args || {});
                const result = await harness.cfSolve({ timeout: parsed.timeout ?? 30 });
                const state = await getCurrentState();
                return {
                    content: [
                        { type: 'text', text: `cf_solve: ${JSON.stringify(result)}\n\nTabs:\n${JSON.stringify(state.tabs, null, 2)}` },
                        { type: 'image', data: state.screenshot, mimeType: 'image/png' },
                    ],
                };
            }
            default:
                return { content: [{ type: 'text', text: `Unknown tool: ${name}` }] };
        }
    } catch (error) {
        console.error(`Tool error in ${name}:`, error);
        return {
            content: [{
                type: 'text',
                text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            }],
        };
    }
});

async function shutdown() {
    if (harness) await harness.stop();
    if (client) await client.quit();
    await server.close();
    process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

const transport = new StdioServerTransport();
server.connect(transport).then(() => {
    console.error('BlueSteel MCP Browser Server running (Camoufox)');
});
