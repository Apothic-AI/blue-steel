import { ClickWebAction, ScrollWebAction, SwitchTabWebAction, TypeWebAction, WebAction } from '@/web/types';
import { parseTypeContent } from './util';
import logger from '@/logger';
import { TabState } from './tabs';
import { Image } from '@/memory/image';
import EventEmitter from 'eventemitter3';
import { CamoufoxClient } from './camoufoxClient';

export interface WebHarnessOptions {
    virtualScreenDimensions?: { width: number; height: number };
    stabilityMs?: number;
    switchTabsOnActivity?: boolean;
}

export interface WebHarnessEvents {
    activePageChanged: (info: { url: string; title: string }) => Promise<void> | void;
}

/**
 * Executes web actions via the BlueSteel Camoufox JSON-lines controller.
 * Not responsible for controller process lifecycle (owned by CamoufoxSession / connector).
 */
export class WebHarness {
    public readonly client: CamoufoxClient;
    private options: WebHarnessOptions;
    public readonly events: EventEmitter<WebHarnessEvents> = new EventEmitter();
    private started = false;

    constructor(client: CamoufoxClient, options: WebHarnessOptions = {}) {
        this.client = client;
        this.options = options;
    }

    async start() {
        if (!this.client.getReady()) {
            await this.client.start();
        }
        this.started = true;
    }

    async stop() {
        this.started = false;
    }

    /** @deprecated Playwright compatibility shim — prefer client methods */
    get page(): never {
        throw new Error('WebHarness.page is unavailable under Camoufox backend. Use harness methods or client.');
    }

    /** @deprecated Playwright compatibility shim */
    get context(): never {
        throw new Error('WebHarness.context is unavailable under Camoufox backend. Use harness methods or client.');
    }

    async retrieveTabState(): Promise<TabState> {
        const status = await this.client.status().catch(() => null);
        let list: any[] = [];
        try {
            const raw = await this.client.tabs();
            list = Array.isArray(raw) ? raw : (raw as any)?.tabs ?? [];
        } catch (err) {
            logger.warn({ err }, 'tabs op failed; falling back to window handles');
            list = (status?.handles ?? []).map((handle: string, i: number) => ({
                title: i === 0 ? status?.title ?? '' : '',
                url: i === 0 ? status?.url ?? '' : '',
                handle,
                active: handle === status?.handle,
            }));
        }
        const activeHandle = status?.handle;

        const tabs = list.map((t: any) => ({
            title: String(t.title ?? t.name ?? ''),
            url: String(t.url ?? ''),
            tabId: t.tabId ?? t.id,
            handle: t.handle ?? t.windowHandle,
            cookieStoreId: t.cookieStoreId,
            container: t.container ?? t.containerName,
        }));

        // If bridge tabs lack titles, fill active from status
        if (status && tabs.length && !tabs.some((t) => t.title || t.url)) {
            const idx = tabs.findIndex((t: any) => t.handle === activeHandle);
            const i = idx >= 0 ? idx : 0;
            tabs[i] = { ...tabs[i], title: status.title, url: status.url };
        }

        let activeTab = 0;
        if (activeHandle) {
            const idx = tabs.findIndex((t: any) => t.handle === activeHandle);
            if (idx >= 0) activeTab = idx;
        } else {
            const idx = list.findIndex((t: any) => t.active);
            if (idx >= 0) activeTab = idx;
        }

        if (tabs.length === 0 && status) {
            tabs.push({ title: status.title, url: status.url, handle: status.handle });
        }

        return { activeTab, tabs };
    }

    async screenshot(): Promise<Image> {
        const retries = 3;
        let lastErr: Error | undefined;
        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                const shot = await this.client.screenshotBase64();
                const image = Image.fromBase64(shot.base64);
                const dpr = shot.dpr || 1;
                const { width, height } = await image.getDimensions();
                // Rescale device pixels → CSS pixels for grounding coordinates
                if (dpr !== 1) {
                    return await image.resize(width / dpr, height / dpr);
                }
                return image;
            } catch (err) {
                lastErr = err as Error;
                if (attempt >= retries) break;
            }
        }
        throw new Error(`Unable to capture screenshot after retries: ${lastErr?.message}`);
    }

    async transformCoordinates({ x, y }: { x: number; y: number }): Promise<{ x: number; y: number }> {
        const virtual = this.options.virtualScreenDimensions;
        if (!virtual) return { x, y };

        let vp = await this.client.viewport().catch(() => null);
        if (!vp?.innerWidth || !vp?.innerHeight) {
            const status = await this.client.status();
            vp = status.viewport ?? null;
        }
        if (!vp?.innerWidth || !vp?.innerHeight) {
            throw new Error('Could not get viewport dimensions to transform coordinates');
        }
        return {
            x: x * (vp.innerWidth / virtual.width),
            y: y * (vp.innerHeight / virtual.height),
        };
    }

    private async _type(content: string) {
        const chunks = parseTypeContent(content);
        const totalTextDelay = 500;
        let totalTextLength = 0;
        for (const chunk of chunks) {
            if (chunk !== '<enter>' && chunk !== '<tab>') totalTextLength += chunk.length;
        }
        for (const chunk of chunks) {
            if (chunk === '<enter>') {
                await this.client.keysPress('Enter');
            } else if (chunk === '<tab>') {
                await this.client.keysPress('Tab');
            } else {
                const chunkProportion = totalTextLength ? chunk.length / totalTextLength : 1;
                const chunkDelay = totalTextDelay * chunkProportion;
                const chunkCharDelay = chunk.length ? chunkDelay / chunk.length : 0;
                await this.client.keysType(chunk, chunkCharDelay);
            }
        }
    }

    async click({ x, y }: { x: number; y: number }, options?: { transform: boolean }) {
        if (options?.transform ?? true) ({ x, y } = await this.transformCoordinates({ x, y }));
        await this.client.mouseClick(x, y, 'left', 1);
        await this.waitForStability();
    }

    async rightClick({ x, y }: { x: number; y: number }, options?: { transform: boolean }) {
        if (options?.transform ?? true) ({ x, y } = await this.transformCoordinates({ x, y }));
        await this.client.mouseClick(x, y, 'right', 1);
        await this.waitForStability();
    }

    async doubleClick({ x, y }: { x: number; y: number }, options?: { transform: boolean }) {
        if (options?.transform ?? true) ({ x, y } = await this.transformCoordinates({ x, y }));
        await this.client.mouseClick(x, y, 'left', 2);
        await this.waitForStability();
    }

    async drag(
        { x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number },
        options?: { transform: boolean }
    ) {
        if (options?.transform ?? true) {
            ({ x: x1, y: y1 } = await this.transformCoordinates({ x: x1, y: y1 }));
            ({ x: x2, y: y2 } = await this.transformCoordinates({ x: x2, y: y2 }));
        }
        await this.client.mouseDrag(x1, y1, x2, y2);
        await this.waitForStability();
    }

    async type({ content }: { content: string }) {
        await this._type(content);
        await this.waitForStability();
    }

    async clickAndType(
        { x, y, content }: { x: number; y: number; content: string },
        options?: { transform: boolean }
    ) {
        if (options?.transform ?? true) ({ x, y } = await this.transformCoordinates({ x, y }));
        await this.client.mouseClick(x, y, 'left', 1);
        await this._type(content);
        await this.waitForStability();
    }

    async scroll(
        { x, y, deltaX, deltaY }: { x: number; y: number; deltaX: number; deltaY: number },
        options?: { transform: boolean }
    ) {
        if (options?.transform ?? true) ({ x, y } = await this.transformCoordinates({ x, y }));
        await this.client.mouseScroll(x, y, deltaX, deltaY);
        await this.waitForStability();
    }

    async switchTab({ index }: { index: number }) {
        const state = await this.retrieveTabState();
        const tab = state.tabs[index] as any;
        if (!tab) throw new Error(`No tab at index ${index}`);
        if (tab.handle) {
            await this.client.switch(tab.handle);
        } else {
            const status = await this.client.status();
            const handle = status.handles?.[index];
            if (!handle) throw new Error(`No window handle at index ${index}`);
            await this.client.switch(handle);
        }
        await this.waitForStability();
    }

    async newTab(url = 'https://www.google.com', container?: string) {
        await this.client.open(url, container);
        await this.waitForStability();
    }

    async navigate(url: string) {
        const result = await this.client.navigate(url);
        if (result.timedOut) {
            logger.warn({ url, current: result.url }, 'navigate timedOut; verifying via status');
            await this.client.status();
        }
        await this.waitForStability();
    }

    async selectAll() {
        await this.client.keysChord(['Control', 'a']);
    }

    async enter() {
        await this.client.keysPress('Enter');
    }

    async backspace() {
        await this.client.keysPress('Backspace');
    }

    async tab() {
        await this.client.keysPress('Tab');
    }

    async goBack() {
        await this.client.goBack();
        await this.waitForStability();
    }

    async getHtml(): Promise<string> {
        return await this.client.html();
    }

    async cfSolve(opts: Record<string, unknown> = {}) {
        return await this.client.cfSolve(opts);
    }

    async ensureContainer(name: string, color?: string, icon?: string) {
        return await this.client.ensureContainer(name, color, icon);
    }

    async openInContainer(url: string, container: string) {
        await this.client.open(url, container);
        await this.waitForStability();
    }

    async executeAction(action: WebAction) {
        if (action.variant === 'click') {
            await this.click(action as ClickWebAction);
        } else if (action.variant === 'type') {
            await this.clickAndType(action as TypeWebAction);
        } else if (action.variant === 'scroll') {
            await this.scroll(action as ScrollWebAction);
        } else if (action.variant === 'tab') {
            await this.switchTab(action as SwitchTabWebAction);
        } else {
            throw Error(`Unhandled web action variant: ${(action as any).variant}`);
        }
    }

    async waitForStability(timeout?: number): Promise<void> {
        const ms = timeout ?? this.options.stabilityMs ?? 400;
        // Quiet-window wait (Playwright network idle is unavailable under Selenium)
        await new Promise((r) => setTimeout(r, ms));
        try {
            await this.client.eval(
                `return document.readyState === 'complete' || document.readyState === 'interactive';`
            );
        } catch {
            // ignore
        }
    }
}
