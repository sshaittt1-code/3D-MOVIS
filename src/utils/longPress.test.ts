import test from 'node:test';
import assert from 'node:assert/strict';
import { LONG_PRESS_DURATION_MS, classifyPressDuration } from './longPress';

test('classifyPressDuration distinguishes short and long press', () => {
  assert.equal(classifyPressDuration(LONG_PRESS_DURATION_MS - 1), 'short');
  assert.equal(classifyPressDuration(LONG_PRESS_DURATION_MS), 'long');
  assert.equal(classifyPressDuration(LONG_PRESS_DURATION_MS + 250), 'long');
});
