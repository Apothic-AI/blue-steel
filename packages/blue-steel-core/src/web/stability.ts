/**
 * Stability under Camoufox uses quiet-window waits in WebHarness.
 * This stub preserves the import surface from Magnitude without Playwright.
 */
export class PageStabilityAnalyzer {
    constructor(_options?: { disableVisualStability?: boolean }) {}
    setActivePage(_page?: unknown) {}
    async waitForStability(timeout?: number): Promise<void> {
        await new Promise((r) => setTimeout(r, timeout ?? 400));
    }
}
