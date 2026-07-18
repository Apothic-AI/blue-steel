// This file is the entry point for the terminal application.
// Most of the core UI logic has been moved to TermAppRenderer.ts

// Re-export specific components if needed by other parts of the application,
// otherwise, this file can remain minimal.

// For example, if constants or specific utility functions from this directory
// are used broadly:
// export * from './constants';
// export * from './util'; // Be careful with this, ensure no circular dependencies

// The TermAppRenderer class is now the primary export for managing the terminal UI.
export { TermAppRenderer } from './termAppRenderer';

// The uiState and uiRenderer modules export their own functions and variables
// and can be imported directly where needed.
