import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compactPlaybackCacheStorage,
  getPrebufferTargetBytes,
  isPlayableFromCache,
  prunePlaybackCacheMap,
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

test('prunePlaybackCacheMap drops stale incomplete entries first', () => {
  const now = Date.now();
  const pruned = prunePlaybackCacheMap({
    live: {
      sourceKey: 'live',
      mediaKey: 'movie:1:::',
      title: 'Movie',
      mediaType: 'movie',
      peerId: '1',
      messageId: 1,
      streamUrl: '/stream',
      downloadUrl: '/stream',
      cachePath: 'cache/live',
      fileName: 'live.mp4',
      mimeType: 'video/mp4',
      fileSizeBytes: 100,
      bytesDownloaded: 20,
      durationSeconds: 60,
      lastPositionSeconds: 12,
      lastUpdatedAt: now,
      isComplete: false
    },
    stale: {
      sourceKey: 'stale',
      mediaKey: 'movie:2:::',
      title: 'Old Movie',
      mediaType: 'movie',
      peerId: '2',
      messageId: 2,
      streamUrl: '/stream',
      downloadUrl: '/stream',
      cachePath: 'cache/stale',
      fileName: 'stale.mp4',
      mimeType: 'video/mp4',
      fileSizeBytes: 100,
      bytesDownloaded: 10,
      durationSeconds: 60,
      lastPositionSeconds: 10,
      lastUpdatedAt: now - (1000 * 60 * 60 * 24),
      isComplete: false
    }
  }, now);

  assert.deepEqual(Object.keys(pruned), ['live']);
});

test('compactPlaybackCacheStorage rewrites storage with pruned entries', () => {
  const storage = createStorage();
  const now = Date.now();

  writePlaybackCacheMap(storage, {
    keep: {
      sourceKey: 'keep',
      mediaKey: 'movie:1:::',
      title: 'Keep',
      mediaType: 'movie',
      peerId: '1',
      messageId: 1,
      streamUrl: '/stream',
      downloadUrl: '/stream',
      cachePath: 'cache/keep',
      fileName: 'keep.mp4',
      mimeType: 'video/mp4',
      fileSizeBytes: 100,
      bytesDownloaded: 100,
      durationSeconds: 60,
      lastPositionSeconds: 60,
      lastUpdatedAt: now,
      isComplete: true,
      cacheUri: 'content://keep'
    },
    drop: {
      sourceKey: 'drop',
      mediaKey: 'movie:2:::',
      title: 'Drop',
      mediaType: 'movie',
      peerId: '2',
      messageId: 2,
      streamUrl: '/stream',
      downloadUrl: '/stream',
      cachePath: 'cache/drop',
      fileName: 'drop.mp4',
      mimeType: 'video/mp4',
      fileSizeBytes: 100,
      bytesDownloaded: 100,
      durationSeconds: 60,
      lastPositionSeconds: 60,
      lastUpdatedAt: now - (1000 * 60 * 60 * 24 * 8),
      isComplete: true,
      cacheUri: 'content://drop'
    }
  });

  const compacted = compactPlaybackCacheStorage(storage, now);
  assert.deepEqual(Object.keys(compacted), ['keep']);
  assert.deepEqual(Object.keys(readPlaybackCacheMap(storage)), ['keep']);
});
