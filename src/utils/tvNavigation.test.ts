import test from 'node:test';
import assert from 'node:assert/strict';
import { isTvBackKey, shouldHandleGlobalTvBack } from './tvNavigation';

test('isTvBackKey recognizes common remote back keys', () => {
  assert.equal(isTvBackKey({ key: 'Escape' }), true);
  assert.equal(isTvBackKey({ key: 'BrowserBack' }), true);
  assert.equal(isTvBackKey({ keyCode: 4 }), true);
  assert.equal(isTvBackKey({ keyCode: 461 }), true);
  assert.equal(isTvBackKey({ key: 'ArrowLeft', keyCode: 37 }), false);
});

test('shouldHandleGlobalTvBack ignores editable targets', () => {
  assert.equal(
    shouldHandleGlobalTvBack({ key: 'Backspace' }, { isEditableTarget: true }),
    false
  );
});

test('shouldHandleGlobalTvBack still allows Escape from editable search inputs', () => {
  assert.equal(
    shouldHandleGlobalTvBack({ key: 'Escape' }, { isEditableTarget: true, hasLocalBackHandler: false }),
    true
  );
});

test('shouldHandleGlobalTvBack ignores ui scope targets', () => {
  assert.equal(
    shouldHandleGlobalTvBack({ key: 'Escape' }, { hasLocalBackHandler: true }),
    false
  );
});

test('shouldHandleGlobalTvBack accepts corridor-level back keys', () => {
  assert.equal(
    shouldHandleGlobalTvBack({ key: 'Escape' }, { isEditableTarget: false, hasLocalBackHandler: false }),
    true
  );
});
