export type TvRemoteEventLike = {
  key?: string;
  keyCode?: number;
  which?: number;
  target?: EventTarget | null;
  preventDefault?: () => void;
  stopPropagation?: () => void;
  stopImmediatePropagation?: () => void;
};

const TV_SELECT_KEYS = new Set(['Enter', 'Select', 'NumpadEnter']);
const TV_SELECT_KEYCODES = new Set([23, 66, 160]);
const TV_DIRECTION_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
const TV_DIRECTION_KEYCODES = new Set([19, 20, 21, 22]);
const TV_DIRECTION_BY_KEY: Record<string, 'up' | 'down' | 'left' | 'right'> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right'
};
const TV_DIRECTION_BY_KEYCODE: Record<number, 'up' | 'down' | 'left' | 'right'> = {
  19: 'up',
  20: 'down',
  21: 'left',
  22: 'right'
};

export const isTvSelectKey = (event: TvRemoteEventLike) => {
  if (event.key && TV_SELECT_KEYS.has(event.key)) return true;
  const code = event.keyCode ?? event.which ?? 0;
  return TV_SELECT_KEYCODES.has(code);
};

export const isTvDirectionalKey = (event: TvRemoteEventLike) => {
  if (event.key && TV_DIRECTION_KEYS.has(event.key)) return true;
  const code = event.keyCode ?? event.which ?? 0;
  return TV_DIRECTION_KEYCODES.has(code);
};

export const getTvDirection = (event: TvRemoteEventLike): 'up' | 'down' | 'left' | 'right' | null => {
  if (event.key && TV_DIRECTION_BY_KEY[event.key]) return TV_DIRECTION_BY_KEY[event.key];
  const code = event.keyCode ?? event.which ?? 0;
  return TV_DIRECTION_BY_KEYCODE[code] ?? null;
};

export const isTvNavigationKey = (event: TvRemoteEventLike) =>
  isTvDirectionalKey(event) || isTvSelectKey(event);

export const stopTvEvent = (event: TvRemoteEventLike) => {
  event.preventDefault?.();
  event.stopPropagation?.();
  event.stopImmediatePropagation?.();
};

export const isUiScopeTarget = (target: EventTarget | null) =>
  typeof Element !== 'undefined' &&
  target instanceof Element &&
  !!target.closest('[data-tv-scope="ui"]');

export const hasLocalBackHandlerTarget = (target: EventTarget | null) =>
  typeof Element !== 'undefined' &&
  target instanceof Element &&
  !!target.closest('[data-tv-back-scope="local"]');
