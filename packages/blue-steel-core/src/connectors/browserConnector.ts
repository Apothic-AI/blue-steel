import { AgentConnector } from '.';
import { WebHarness } from '@/web/harness';
import { ActionDefinition } from '@/actions';
import { webActions, camoufoxActions } from '@/actions/webActions';
import { BrowserOptions, BrowserProvider, CamoufoxSession } from '@/web/browserProvider';
import logger from '@/logger';
import { Logger } from 'pino';
import { TabState } from '@/web/tabs';
import { Observation } from '@/memory/observation';
import { Image } from '@/memory/image';
import {
    applyCoordinateGrid,
    CoordinateGridOptions,
    resolveCoordinateGridOptions,
} from '@/memory/coordinateGrid';
import { ActionVisualizerOptions } from '@/web/visualizer';

const DEFAULT_MIN_RETAINED_SCREENSHOTS = 2;

export interface BrowserConnectorOptions {
    browser?: BrowserOptions;
    url?: string;
    virtualScreenDimensions?: { width: number; height: number };
    minScreenshots?: number;
    visuals?: ActionVisualizerOptions;
    /** Open initial URL in this Firefox container */
    container?: string;
    stabilityMs?: number;
    /**
     * Optional labeled coordinate grid on agent screenshots (observation-only).
     * Helps vision models read absolute x/y for mouse actions.
     * Also enabled via BLUE_STEEL_COORDINATE_GRID=1.
     */
    coordinateGrid?: boolean | CoordinateGridOptions;
}

export interface BrowserConnectorStateData {
    screenshot: Image;
    tabs: TabState;
}

export class BrowserConnector implements AgentConnector {
    public readonly id: string = 'web';
    private harness!: WebHarness;
    private options: BrowserConnectorOptions;
    private session!: CamoufoxSession;
    private logger: Logger;
    private ownsSession = true;

    constructor(options: BrowserConnectorOptions = {}) {
        this.options = options;
        this.logger = logger.child({
            name: `connectors.${this.id}`,
        });
    }

    async onStart(): Promise<void> {
        this.logger.info('Starting Camoufox browser connector...');
        this.session = await BrowserProvider.getInstance().getSession(this.options.browser ?? {});
        this.ownsSession = !this.options.browser?.client;

        this.harness = new WebHarness(this.session.client, {
            virtualScreenDimensions: this.options.virtualScreenDimensions,
            stabilityMs: this.options.stabilityMs,
        });
        await this.harness.start();
        this.logger.info('WebHarness started.');

        if (this.options.url) {
            this.logger.info(`Navigating to initial URL: ${this.options.url}`);
            if (this.options.container) {
                await this.harness.openInContainer(this.options.url, this.options.container);
            } else {
                await this.harness.navigate(this.options.url);
            }
        }
        this.logger.info('Started successfully.');
    }

    async onStop(): Promise<void> {
        this.logger.info('Stopping...');
        if (this.harness) {
            await this.harness.stop();
            this.logger.info('WebHarness cleaned up.');
        }
        if (this.session && this.ownsSession) {
            await this.session.release();
            this.logger.info('Camoufox session released.');
        }
        this.logger.info('Stopped successfully.');
    }

    getActionSpace(): ActionDefinition<any>[] {
        return [...webActions, ...camoufoxActions];
    }

    public getHarness(): WebHarness {
        if (!this.harness) {
            throw new Error('BrowserConnector: Harness is not available. Ensure onStart has completed.');
        }
        return this.harness;
    }

    public getClient() {
        return this.session.client;
    }

    private async captureCurrentState(): Promise<BrowserConnectorStateData> {
        if (!this.harness) {
            throw new Error('BrowserConnector: Harness is not available for capturing state.');
        }
        const [screenshot, tabs] = await Promise.all([
            this.harness.screenshot(),
            this.harness.retrieveTabState(),
        ]);
        return { screenshot: await this.transformScreenshot(screenshot), tabs };
    }

    async transformScreenshot(screenshot: Image): Promise<Image> {
        let image = screenshot;
        if (this.options.virtualScreenDimensions) {
            image = await image.resize(
                this.options.virtualScreenDimensions.width,
                this.options.virtualScreenDimensions.height
            );
        }
        const grid = resolveCoordinateGridOptions(this.options.coordinateGrid);
        if (grid) {
            image = await applyCoordinateGrid(image, grid);
            // Optional: dump what the model sees (grid is observation-only, not on the live page)
            const debugDir = process.env.BLUE_STEEL_COORDINATE_GRID_DEBUG;
            if (debugDir) {
                try {
                    const fs = await import('fs/promises');
                    const path = await import('path');
                    await fs.mkdir(debugDir, { recursive: true });
                    const file = path.join(debugDir, `grid-${Date.now()}.png`);
                    await image.saveToFile(file);
                    this.logger.info({ file }, 'Wrote coordinate-grid debug screenshot');
                } catch (err) {
                    this.logger.warn({ err }, 'Failed to write coordinate-grid debug screenshot');
                }
            }
        }
        return image;
    }

    public async getLastScreenshot(): Promise<Image> {
        return (await this.captureCurrentState()).screenshot;
    }

    async collectObservations(): Promise<Observation[]> {
        const currentState = await this.captureCurrentState();
        const observations: Observation[] = [];

        const currentTabs = currentState.tabs;
        let tabInfo = 'Open Tabs:\n';
        currentTabs.tabs.forEach((tab, index) => {
            const container = (tab as any).container ? ` [${(tab as any).container}]` : '';
            tabInfo += `${index === currentTabs.activeTab ? '[ACTIVE] ' : ''}${tab.title} (${tab.url})${container}\n`;
        });

        const screenshotLimit = this.options.minScreenshots ?? DEFAULT_MIN_RETAINED_SCREENSHOTS;

        // captureCurrentState already ran transformScreenshot (virtual resize + optional grid)
        observations.push(
            Observation.fromConnector(
                this.id,
                currentState.screenshot,
                { type: 'screenshot', limit: screenshotLimit, dedupe: true }
            )
        );
        observations.push(
            Observation.fromConnector(this.id, tabInfo, { type: 'tabinfo', limit: 1 })
        );
        return observations;
    }

    async getInstructions(): Promise<void | string> {
        const parts: string[] = [
            'Coordinate clicks use the screenshot pixel space (origin top-left). If a labeled coordinate grid is visible on the screenshot, use the top/left edge labels to aim at control centers.',
            'Captchas and anti-bot widgets are often animated: images, options, or odd-one-out subjects can appear, move, fade, or swap over time. A single screenshot is a freeze-frame and may be incomplete, blank, mid-transition, or missing the real target.',
            'If a captcha does not make sense, looks empty/partial, or your clicks have no effect: take more observations before acting — use short waits (1–3s) and re-check successive screenshots rather than repeatedly clicking the same coords.',
            'Prefer waiting for a stable captcha frame (all choices visible, prompt readable) before selecting. For Cloudflare Turnstile/interstitials, prefer browser:cf:solve when available.',
            'Do not assume a failed captcha click means the answer was wrong; animation timing and loading states are common. Observe again, then act.',
        ];
        if (resolveCoordinateGridOptions(this.options.coordinateGrid)) {
            parts.unshift(
                'Screenshots include a thin coordinate grid with numeric labels on the top (x) and left (y) edges only. Read those labels when choosing mouse x/y.',
            );
        }
        return parts.join('\n');
    }
}
