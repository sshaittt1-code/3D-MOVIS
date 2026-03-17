import test from 'node:test';
import assert from 'node:assert/strict';
import { BACK_EVENT_DEBOUNCE_MS, shouldIgnoreBackEvent } from './backNavigation';

test('shouldIgnoreBackEvent rejects duplicate back presses inside the debounce window', () => {
  assert.equal(shouldIgnoreBackEvent(1000, 1100), true);
  assert.equal(shouldIgnoreBackEvent(1000, 1000 + BACK_EVENT_DEBOUNCE_MS - 1), true);
});

test('shouldIgnoreBackEvent accepts the first back event and later presses outside the debounce window', () => {
  assert.equal(shouldIgnoreBackEvent(null, 1000), false);
  assert.equal(shouldIgnoreBackEvent(1000, 1000 + BACK_EVENT_DEBOUNCE_MS), false);
  assert.equal(shouldIgnoreBackEvent(1000, 1500), false);
});
