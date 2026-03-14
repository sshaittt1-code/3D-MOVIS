export const LONG_PRESS_DURATION_MS = 550;

export type PressKind = 'short' | 'long';

export const classifyPressDuration = (durationMs: number, thresholdMs = LONG_PRESS_DURATION_MS): PressKind =>
  durationMs >= thresholdMs ? 'long' : 'short';
