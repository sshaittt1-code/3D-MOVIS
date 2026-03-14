import test from 'node:test';
import assert from 'node:assert/strict';
import { readAutoPlayNextEpisode, writeAutoPlayNextEpisode } from './playerSettings';

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

test('autoplay setting defaults to enabled', () => {
  const storage = createStorage();
  assert.equal(readAutoPlayNextEpisode(storage), true);
});

test('autoplay setting persists false and true values', () => {
  const storage = createStorage();
  writeAutoPlayNextEpisode(storage, false);
  assert.equal(readAutoPlayNextEpisode(storage), false);
  writeAutoPlayNextEpisode(storage, true);
  assert.equal(readAutoPlayNextEpisode(storage), true);
});
