import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPreparedPlayback,
  buildSubtitleSearchQuery,
  buildTelegramSearchQuery,
  getResumePositionSeconds,
  isPlayableMediaItem,
  pickDefaultSubtitle,
  type TelegramSearchResult
} from './telegramPlayer';
import type { CorridorItem } from './contentModel';

const makeItem = (overrides: Partial<CorridorItem>): CorridorItem => ({
  id: 1,
  title: 'Sample',
  poster: 'https://example.com/poster.jpg',
  mediaType: 'movie',
  ...overrides
});

test('telegram search query uses series + episode identity for episodes', () => {
  const query = buildTelegramSearchQuery(makeItem({
    mediaType: 'episode',
    title: 'Pilot',
    seriesTitle: 'Dark Matter',
    seasonNum: 1,
    episode_number: 2
  }));

  assert.equal(query, 'Dark Matter S01E02 Pilot');
});

test('subtitle query stays broad and human readable', () => {
  const query = buildSubtitleSearchQuery(makeItem({
    mediaType: 'episode',
    title: 'Pilot',
    seriesTitle: 'Dark Matter',
    seasonNum: 1,
    episode_number: 2
  }));

  assert.equal(query, 'Dark Matter season 1 episode 2');
});

test('playable media items are limited to movies and episodes', () => {
  assert.equal(isPlayableMediaItem(makeItem({ mediaType: 'movie' })), true);
  assert.equal(isPlayableMediaItem(makeItem({ mediaType: 'episode' })), true);
  assert.equal(isPlayableMediaItem(makeItem({ mediaType: 'tv' })), false);
  assert.equal(isPlayableMediaItem(makeItem({ mediaType: 'season' })), false);
});

test('resume position comes from the media state map', () => {
  const item = makeItem({ mediaType: 'movie', id: 5 });
  assert.equal(getResumePositionSeconds(item, {
    'movie:5:::': {
      key: 'movie:5:::',
      snapshot: { id: 5, mediaType: 'movie', title: 'Movie' },
      favorite: false,
      watchStatus: 'in_progress',
      progressSeconds: 74,
      durationSeconds: 120,
      progressPercent: 0.61,
      lastWatchedAt: 1
    }
  }), 74);
});

test('prepared playback resolves absolute stream and subtitle urls', () => {
  const mediaItem = makeItem({ id: 42, mediaType: 'movie', title: 'Dune' });
  const source: TelegramSearchResult = {
    id: 99,
    peerId: '1001',
    title: 'Dune 2021',
    fileName: 'dune.mkv',
    sizeBytes: 1024,
    mimeType: 'video/x-matroska',
    durationSeconds: 6000
  };

  const prepared = buildPreparedPlayback({
    apiBase: 'https://api.example.com',
    mediaItem,
    source,
    sourceInfo: {
      streamUrl: '/api/tg/stream/1001/99?token=abc',
      downloadUrl: '/api/tg/stream/1001/99?token=abc',
      fileName: 'dune.mkv',
      fileSizeBytes: 1024,
      mimeType: 'video/x-matroska',
      durationSeconds: 6000
    },
    subtitleUrl: '/api/tg/subtitle/1001/55?token=sub',
    resumePositionSeconds: 87
  });

  assert.equal(prepared.streamUrl, 'https://api.example.com/api/tg/stream/1001/99?token=abc');
  assert.equal(prepared.subtitleUrl, 'https://api.example.com/api/tg/subtitle/1001/55?token=sub');
  assert.equal(prepared.resumePositionSeconds, 87);
  assert.ok(prepared.sourceKey.startsWith('src_'));
});

test('default subtitle picks the first available candidate', () => {
  assert.equal(pickDefaultSubtitle([
    { id: 1, peerId: '2', title: 'one', subtitleUrl: '/one' },
    { id: 2, peerId: '3', title: 'two', subtitleUrl: '/two' }
  ]), '/one');
});
