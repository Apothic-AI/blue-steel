/**
 * No-op action visualizer for Camoufox backend.
 * Magnitude's Playwright-injected cursor overlays are deferred.
 */
export interface ActionVisualizerOptions {
    showCursor?: boolean;
    [key: string]: unknown;
}

export class ActionVisualizer {
    constructor(_context?: unknown, _options: ActionVisualizerOptions = {}) {}
    async setup() {}
    async setActivePage(_page?: unknown) {}
    async moveVirtualCursor(_x: number, _y: number) {}
    async hideAll() {}
    async showAll() {}
    async visualizeAction(_x: number, _y: number) {}
    async removeActionVisuals() {}
}
