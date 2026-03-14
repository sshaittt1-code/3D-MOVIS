import test from 'node:test';
import assert from 'node:assert/strict';
import { applyDeleteRange } from './keyboardActions';

test('applyDeleteRange removes the previous character on Backspace', () => {
  const next = applyDeleteRange('shalom', 6, 6, 'backward');
  assert.equal(next.value, 'shalo');
  assert.equal(next.caret, 5);
});

test('applyDeleteRange removes the selected range safely', () => {
  const next = applyDeleteRange('123456', 2, 4, 'backward');
  assert.equal(next.value, '1256');
  assert.equal(next.caret, 2);
});

test('applyDeleteRange leaves empty input stable', () => {
  const next = applyDeleteRange('', 0, 0, 'backward');
  assert.equal(next.value, '');
  assert.equal(next.caret, 0);
});
