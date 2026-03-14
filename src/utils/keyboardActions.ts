const EDITABLE_INPUT_TYPES = new Set(['', 'text', 'search', 'tel', 'password', 'email', 'url', 'number']);

export const isEditableTextTarget = (
  target: EventTarget | null
): target is HTMLInputElement | HTMLTextAreaElement => {
  if (typeof HTMLElement === 'undefined') return false;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return false;
  if (target instanceof HTMLInputElement && !EDITABLE_INPUT_TYPES.has(target.type)) return false;
  return !target.readOnly && !target.disabled;
};

export const applyDeleteRange = (value: string, selectionStart: number, selectionEnd: number, direction: 'backward' | 'forward') => {
  if (selectionStart !== selectionEnd) {
    return {
      value: `${value.slice(0, selectionStart)}${value.slice(selectionEnd)}`,
      caret: selectionStart
    };
  }

  if (direction === 'backward') {
    if (selectionStart <= 0) return { value, caret: 0 };
    return {
      value: `${value.slice(0, selectionStart - 1)}${value.slice(selectionEnd)}`,
      caret: selectionStart - 1
    };
  }

  if (selectionStart >= value.length) return { value, caret: value.length };
  return {
    value: `${value.slice(0, selectionStart)}${value.slice(selectionStart + 1)}`,
    caret: selectionStart
  };
};

export const applyEditingKeyToInput = (
  element: HTMLInputElement | HTMLTextAreaElement,
  key: 'Backspace' | 'Delete'
) => {
  const currentValue = element.value ?? '';
  const selectionStart = element.selectionStart ?? currentValue.length;
  const selectionEnd = element.selectionEnd ?? currentValue.length;
  const next = applyDeleteRange(currentValue, selectionStart, selectionEnd, key === 'Delete' ? 'forward' : 'backward');

  element.value = next.value;
  element.setSelectionRange?.(next.caret, next.caret);
  element.dispatchEvent(new Event('input', { bubbles: true }));
  return next.value;
};
