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
        if (this.options.virtualScreenDimensions) {
            return await screenshot.resize(
                this.options.virtualScreenDimensions.width,
                this.options.virtualScreenDimensions.height
            );
        }
        return screenshot;
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

        observations.push(
            Observation.fromConnector(
                this.id,
                await this.transformScreenshot(currentState.screenshot),
                { type: 'screenshot', limit: screenshotLimit, dedupe: true }
            )
        );
        observations.push(
            Observation.fromConnector(this.id, tabInfo, { type: 'tabinfo', limit: 1 })
        );
        return observations;
    }

    async getInstructions(): Promise<void | string> {
        return;
    }
}
