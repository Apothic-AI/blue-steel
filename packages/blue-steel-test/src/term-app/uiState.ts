import { RegisteredTest } from '@/discovery/types'; // Changed import
import { AllTestStates } from './types';
import { MAX_APP_WIDTH, spinnerChars as localSpinnerChars } from './constants'; // Import and alias

// --- UI State ---
// Export spinnerChars so TermAppRenderer can access it via uiState.spinnerChars
export const spinnerChars = localSpinnerChars;

export interface RenderSettings {
    showActions: boolean;
    showThoughts: boolean;
}

// currentWidth removed as it's no longer used for layout
export let redrawScheduled = false;
export let renderSettings: RenderSettings = { showActions: true, showThoughts: false };
export let timerInterval: NodeJS.Timeout | null = null;
export let currentTestStates: AllTestStates = {};
export let allRegisteredTests: RegisteredTest[] = []; // Changed from currentTests
export let currentModel = '';
export let elapsedTimes: { [testId: string]: number } = {};
export let isFinished = false;
export let spinnerFrame = 0;
export let lastOutputLineCount = 0; // Track lines for stability
export let isFirstDraw = true; // Flag to handle the first redraw specially
// resizeTimeout removed
// isResizing removed

/**
 * Resets all UI state to initial values
 */
export function resetState() {
    // currentWidth reset removed
    redrawScheduled = false;
    renderSettings = { showActions: true, showThoughts: false }; // Reset render settings
    timerInterval = null;
    currentTestStates = {};
    allRegisteredTests = []; // Changed from currentTests
    currentModel = '';
    elapsedTimes = {};
    isFinished = false;
    spinnerFrame = 0;
    lastOutputLineCount = 0;
    isFirstDraw = true;
    // resizeTimeout reset removed
    // isResizing reset removed
}

/**
 * Sets the redrawScheduled flag
 */
export function setRedrawScheduled(value: boolean) {
    redrawScheduled = value;
}

/**
 * Sets the lastOutputLineCount
 */
export function setLastOutputLineCount(count: number) {
    lastOutputLineCount = count;
}

/**
 * Sets the isFirstDraw flag
 */
export function setIsFirstDraw(value: boolean) {
    isFirstDraw = value;
}

// setCurrentWidth removed
// setIsResizing removed
// setResizeTimeout removed

/**
 * Sets the currentModel
 */
export function setCurrentModel(model: string) {
    currentModel = model;
}

/**
 * Sets the allRegisteredTests
 */
export function setAllRegisteredTests(tests: RegisteredTest[]) { // Changed signature
    allRegisteredTests = tests;
}

/**
 * Sets the currentTestStates
 */
export function setCurrentTestStates(states: AllTestStates) {
    currentTestStates = states;
}

/**
 * Sets the timerInterval
 */
export function setTimerInterval(interval: NodeJS.Timeout | null) {
    timerInterval = interval;
}

/**
 * Sets the spinnerFrame
 */
export function setSpinnerFrame(frame: number) {
    spinnerFrame = frame;
}

/**
 * Sets the elapsedTimes
 */
export function setElapsedTimes(times: { [testId: string]: number }) {
    elapsedTimes = times;
}

/**
 * Updates a specific entry in the elapsedTimes map
 */
export function updateElapsedTime(testId: string, time: number) {
    elapsedTimes[testId] = time;
}

/**
 * Sets the isFinished flag
 */
export function setIsFinished(value: boolean) {
    isFinished = value;
}

/**
 * Sets the renderSettings
 */
export function setRenderSettings(settings: RenderSettings) {
    renderSettings = settings;
}
