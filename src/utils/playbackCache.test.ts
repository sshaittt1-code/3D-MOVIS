import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getPrebufferTargetBytes,
  isPlayableFromCache,
  readPlaybackCacheMap,
  removePlaybackCacheEntry,
  shouldDeleteCompletedCache,
  upsertPlaybackCacheEntry,
  writePlaybackCacheMap
} from './playbackCache';

const createStorage = () => {
  const state = new Map<string, string>();
  return {
    getItem(key: string) {
      return state.has(key) ? state.get(key)! : null;
    },
    setItem(key: string, value: string) {
      state.set(key, value);
    },
    removeItem(key: string) {
      state.delete(key);
    }
  };
};

test('playback cache persists entries safely', () => {
  const storage = createStorage();
  const cache = upsertPlaybackCacheEntry({}, 'src_1', {
    sourceKey: 'src_1',
    mediaKey: 'movie:1:::',
    title: 'Movie',
    mediaType: 'movie',
    peerId: '100',
    messageId: 10,
    streamUrl: '/stream',
    downloadUrl: '/stream',
    cachePath: 'cache/file.mp4',
    fileSizeBytes: 1000
  });

  writePlaybackCacheMap(storage, cache);
  assert.deepEqual(readPlaybackCacheMap(storage), cache);
});

test('prebuffer target clamps to file size when file is smaller', () => {
  assert.equal(getPrebufferTargetBytes(10 * 1024 * 1024), 10 * 1024 * 1024);
  assert.equal(getPrebufferTargetBytes(80 * 1024 * 1024), 50 * 1024 * 1024);
});

test('completed cache cleanup only happens for watched items', () => {
  const entry = upsertPlaybackCacheEntry({}, 'src_1', {
    sourceKey: 'src_1',
    mediaKey: 'movie:1:::',
    title: 'Movie',
    mediaType: 'movie',
    peerId: '100',
    messageId: 10,
    streamUrl: '/stream',
    downloadUrl: '/stream',
    cachePath: 'cache/file.mp4',
    fileSizeBytes: 1000,
    cacheUri: 'content://cache/file.mp4',
    isComplete: true
  }).src_1;

  assert.equal(isPlayableFromCache(entry), true);
  assert.equal(shouldDeleteCompletedCache(entry, true), true);
  assert.equal(shouldDeleteCompletedCache(entry, false), false);
  assert.deepEqual(removePlaybackCacheEntry({ src_1: entry }, 'src_1'), {});
});
