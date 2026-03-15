export type TvKeyEventLike = {
  key?: string;
  keyCode?: number;
  which?: number;
};

export type TvBackContext = {
  isEditableTarget?: boolean;
  hasLocalBackHandler?: boolean;
};

const TV_BACK_KEYS = new Set(['Escape', 'Backspace', 'GoBack', 'BrowserBack']);
const TV_BACK_KEYCODES = new Set([4, 8, 27, 166, 461]);

export const isTvBackKey = (event: TvKeyEventLike) => {
  if (event.key && TV_BACK_KEYS.has(event.key)) return true;
  const code = event.keyCode ?? event.which ?? 0;
  return TV_BACK_KEYCODES.has(code);
};

export const shouldHandleGlobalTvBack = (
  event: TvKeyEventLike,
  context: TvBackContext = {}
) => {
  if (!isTvBackKey(event)) return false;
  if (context.isEditableTarget) return false;
  if (context.hasLocalBackHandler) return false;
  return true;
};
