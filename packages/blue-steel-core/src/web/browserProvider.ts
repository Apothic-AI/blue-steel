import logger from '@/logger';
import { Logger } from 'pino';
import { CamoufoxClient, CamoufoxClientOptions, CamoufoxReadyEvent } from './camoufoxClient';

export type BrowserOptions = {
    profileName?: string;
    profile?: string;
    headless?: boolean;
    skillDir?: string;
    noContainerProxy?: boolean;
    /** @deprecated Playwright CDP path — ignored under Camoufox */
    cdp?: string;
    /** @deprecated Playwright launch options — ignored under Camoufox */
    launchOptions?: Record<string, unknown>;
    /** @deprecated Playwright context options — partially mapped */
    contextOptions?: {
        viewport?: { width: number; height: number };
        deviceScaleFactor?: number;
    };
    /** Pre-started client (advanced) */
    client?: CamoufoxClient;
};

export class CamoufoxSession {
    readonly client: CamoufoxClient;
    ready: CamoufoxReadyEvent | null = null;
    private refCount = 0;

    constructor(client: CamoufoxClient) {
        this.client = client;
    }

    async acquire(): Promise<CamoufoxClient> {
        if (!this.ready) {
            this.ready = await this.client.start();
        }
        this.refCount++;
        return this.client;
    }

    async release(): Promise<void> {
        this.refCount = Math.max(0, this.refCount - 1);
        if (this.refCount <= 0) {
            await this.client.quit();
            this.ready = null;
        }
    }
}

/**
 * Session provider for BlueSteel Camoufox controllers.
 * Replaces Magnitude's Playwright BrowserProvider.
 */
export class BrowserProvider {
    private sessions: Map<string, CamoufoxSession> = new Map();
    private logger: Logger;

    private constructor() {
        this.logger = logger.child({ name: 'browser_provider' });
    }

    public static getInstance(): BrowserProvider {
        if (!(globalThis as any).__blue_steel__) {
            (globalThis as any).__blue_steel__ = {};
        }
        if (!(globalThis as any).__blue_steel__.browserProvider) {
            (globalThis as any).__blue_steel__.browserProvider = new BrowserProvider();
        }
        return (globalThis as any).__blue_steel__.browserProvider;
    }

    private sessionKey(options: BrowserOptions): string {
        return JSON.stringify({
            profileName: options.profileName ?? process.env.BLUE_STEEL_PROFILE_NAME ?? 'blue-steel',
            profile: options.profile ?? null,
            headless: options.headless ?? false,
            skillDir: options.skillDir ?? process.env.BLUE_STEEL_SKILL_DIR ?? null,
            noContainerProxy: options.noContainerProxy ?? false,
        });
    }

    async getSession(options: BrowserOptions = {}): Promise<CamoufoxSession> {
        if (options.client) {
            const session = new CamoufoxSession(options.client);
            await session.acquire();
            return session;
        }

        const key = this.sessionKey(options);
        let session = this.sessions.get(key);
        if (!session) {
            this.logger.trace({ key }, 'Creating new Camoufox session');
            const clientOpts: CamoufoxClientOptions = {
                profileName: options.profileName,
                profile: options.profile,
                headless: options.headless,
                skillDir: options.skillDir,
                noContainerProxy: options.noContainerProxy,
            };
            session = new CamoufoxSession(new CamoufoxClient(clientOpts));
            this.sessions.set(key, session);
        }
        await session.acquire();
        return session;
    }

    /** @deprecated Use getSession — name retained for Magnitude API familiarity */
    async newContext(options?: BrowserOptions): Promise<CamoufoxSession> {
        return this.getSession(options ?? {});
    }
}

// Back-compat type alias used in connector options
export type { CamoufoxClient };
