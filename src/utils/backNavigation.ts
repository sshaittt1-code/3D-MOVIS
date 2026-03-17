export const BACK_EVENT_DEBOUNCE_MS = 220;

export const shouldIgnoreBackEvent = (
  lastHandledAt: number | null,
  nextHandledAt: number,
  debounceMs: number = BACK_EVENT_DEBOUNCE_MS
) => (
  lastHandledAt !== null
  && nextHandledAt - lastHandledAt < debounceMs
);
