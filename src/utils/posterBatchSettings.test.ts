import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_POSTER_BATCH_SIZE,
  normalizePosterBatchSize,
  readPosterBatchSize,
  writePosterBatchSize
} from './posterBatchSettings';

const createStorage = () => {
  const state = new Map<string, string>();
  return {
    getItem(key: string) {
      return state.has(key) ? state.get(key)! : null;
    },
    setItem(key: string, value: string) {
      state.set(key, value);
    }
  };
};

test('poster batch size normalizes invalid values to default', () => {
  assert.equal(normalizePosterBatchSize('20'), 20);
  assert.equal(normalizePosterBatchSize('17'), DEFAULT_POSTER_BATCH_SIZE);
  assert.equal(normalizePosterBatchSize('100'), 40);
  assert.equal(normalizePosterBatchSize(null), DEFAULT_POSTER_BATCH_SIZE);
});

test('poster batch size persists safely', () => {
  const storage = createStorage();
  writePosterBatchSize(storage, 30);
  assert.equal(readPosterBatchSize(storage), 30);
});
