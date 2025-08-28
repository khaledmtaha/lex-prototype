/**
 * Development-only logging utilities.
 * Uses Vite's import.meta.env.DEV for reliable browser-side detection.
 */

export function logDevWarning(context: string, message: string): void {
  if (import.meta.env.DEV) {
    console.warn(`[${context}] ${message}`);
  }
}

// Legacy functions for backward compatibility
export function logHeadingWarning(message: string): void {
  if (import.meta.env.DEV) {
    console.warn(message); // message already includes [HeadingPolicy] prefix
  }
}

export function logCommandWarning(message: string): void {
  logDevWarning('formatHeading', message);
}