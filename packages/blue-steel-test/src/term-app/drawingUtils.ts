//import { ActionDescriptor, FailureDescriptor } from 'blue-steel-core';
import { ANSI_RESET, ANSI_GREEN, ANSI_BRIGHT_BLUE, ANSI_GRAY, ANSI_RED } from './constants';
import { TestState } from '@/runner/state';

/**
 * Calculate the visible length of a string, accounting for ANSI escape codes.
 * @param s The string to calculate the length for
 * @returns The visible length of the string
 */
export const str = (s: string): number => {
    // Basic ANSI escape code removal for length calculation
    // This is a simplified version and might not cover all ANSI sequences.
    const ansiRegex = /\x1b\[[0-9;]*[mGKH]/g;
    return s.replace(ansiRegex, '').length;
};

// Box drawing functions removed as per user request to remove borders.
// createBoxAnsi was here
// insertLineIntoBoxAnsi was here


/**
 * Get the status indicator character for a test.
 * @param status Test status
 * @returns Plain character symbol
 */
export function getTestStatusIndicatorChar(status: TestState['status']): string {
    // Returns plain char
    switch (status) {
        case 'passed': return '✓';
        case 'failed': return '✕';
        case 'cancelled': return '⊘';
        case 'pending':
        default: return '◌';
    }
}

/**
 * Get the status indicator character for a step.
 * @param status Step status
 * @returns Plain character symbol
 */
export function getStepStatusIndicatorChar(status: TestState['status']): string {
    // Returns plain char
    switch (status) {
        case 'running': return '>'; case 'passed': return '⚑';
        case 'failed': return '✕'; case 'cancelled': return '⊘';
        case 'pending': default: return '•';
    }
}

/**
 * Get the status indicator character for a check.
 * @param status Check status
 * @returns Plain character symbol
 */
export function getCheckStatusIndicatorChar(status: TestState['status']): string {
    // Returns plain char
    switch (status) {
        case 'running': return '?'; case 'passed': return '✓';
        case 'failed': return '✕'; case 'cancelled': return '⊘';
        case 'pending': default: return '•';
    }
}

/**
 * Apply styling to text based on status and type.
 * @param status The status to style for
 * @param text The text to style
 * @param type The type of element being styled
 * @returns String with ANSI codes
 */
export function styleAnsi(status: TestState['status'], text: string, type: 'test' | 'step' | 'check'): string {
    // Returns string with ANSI codes
    let colorCode = ANSI_GRAY; // Default gray
    switch (type) {
        case 'test':
            switch (status) {
                case 'running': colorCode = ANSI_BRIGHT_BLUE; break;
                case 'passed': colorCode = ANSI_GREEN; break;
                case 'failed': colorCode = ANSI_RED; break;
                case 'cancelled': colorCode = ANSI_GRAY; break;
            }
            break;
        case 'step':
            switch (status) {
                case 'running': colorCode = ANSI_GRAY; break;
                case 'passed': colorCode = ANSI_BRIGHT_BLUE; break;
                case 'failed': colorCode = ANSI_RED; break;
                case 'cancelled': colorCode = ANSI_GRAY; break;
            }
            break;
        case 'check':
            switch (status) {
                case 'running': colorCode = ANSI_GRAY; break;
                case 'passed': colorCode = ANSI_BRIGHT_BLUE; break;
                case 'failed': colorCode = ANSI_RED; break;
                case 'cancelled': colorCode = ANSI_GRAY; break;
            }
            break;
    }
    // Important: Ensure reset code is appended
    return `${colorCode}${text}${ANSI_RESET}`;
}
