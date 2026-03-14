import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlaybackSourceKey } from './sourceKey';

test('buildPlaybackSourceKey is stable for the same source', () => {
  const first = buildPlaybackSourceKey({
    mediaKey: 'episode:10:42:1:2',
    peerId: '1001',
    messageId: 55,
    fileName: 'episode.mkv',
    fileSizeBytes: 1234,
    mimeType: 'video/mp4'
  });

  const second = buildPlaybackSourceKey({
    mediaKey: 'episode:10:42:1:2',
    peerId: '1001',
    messageId: 55,
    fileName: 'episode.mkv',
    fileSizeBytes: 1234,
    mimeType: 'video/mp4'
  });

  assert.equal(first, second);
});

test('buildPlaybackSourceKey changes when telegram source changes', () => {
  const first = buildPlaybackSourceKey({
    mediaKey: 'movie:10:::',
    peerId: '1001',
    messageId: 55
  });

  const second = buildPlaybackSourceKey({
    mediaKey: 'movie:10:::',
    peerId: '1001',
    messageId: 56
  });

  assert.notEqual(first, second);
});
