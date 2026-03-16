import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getTvDirection,
  hasLocalBackHandlerTarget,
  isTvDirectionalKey,
  isTvNavigationKey,
  isTvSelectKey,
  isUiScopeTarget
} from './tvRemote';

test('isTvSelectKey recognizes common TV select keys', () => {
  assert.equal(isTvSelectKey({ key: 'Enter' }), true);
  assert.equal(isTvSelectKey({ key: 'Select' }), true);
  assert.equal(isTvSelectKey({ keyCode: 23 }), true);
  assert.equal(isTvSelectKey({ keyCode: 66 }), true);
  assert.equal(isTvSelectKey({ key: 'ArrowUp' }), false);
});

test('isTvDirectionalKey recognizes d-pad arrows and keycodes', () => {
  assert.equal(isTvDirectionalKey({ key: 'ArrowLeft' }), true);
  assert.equal(isTvDirectionalKey({ keyCode: 22 }), true);
  assert.equal(isTvDirectionalKey({ keyCode: 19 }), true);
  assert.equal(isTvDirectionalKey({ key: 'Select' }), false);
});

test('getTvDirection resolves arrows from key and keycode', () => {
  assert.equal(getTvDirection({ key: 'ArrowUp' }), 'up');
  assert.equal(getTvDirection({ keyCode: 20 }), 'down');
  assert.equal(getTvDirection({ keyCode: 21 }), 'left');
  assert.equal(getTvDirection({ key: 'Enter' }), null);
});

test('isTvNavigationKey combines select and directional keys', () => {
  assert.equal(isTvNavigationKey({ key: 'ArrowDown' }), true);
  assert.equal(isTvNavigationKey({ keyCode: 23 }), true);
  assert.equal(isTvNavigationKey({ key: 'a' }), false);
});

test('ui scope helpers stay safe when Element is unavailable', () => {
  assert.equal(isUiScopeTarget(null), false);
  assert.equal(hasLocalBackHandlerTarget(null), false);
  assert.equal(isUiScopeTarget({} as EventTarget), false);
  assert.equal(hasLocalBackHandlerTarget({} as EventTarget), false);
});
