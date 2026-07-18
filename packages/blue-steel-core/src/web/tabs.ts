export interface TabState {
    activeTab: number;
    tabs: {
        title: string;
        url: string;
        tabId?: number;
        handle?: string;
        cookieStoreId?: string;
        container?: string;
    }[];
}

/**
 * Tab state is retrieved live from the Camoufox controller.
 * This module keeps the TabState type for observation formatting.
 */
export class TabManager {
    // Intentionally minimal — WebHarness.retrieveTabState owns tab listing.
}
