import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifySearchSource,
  deriveLibraryCollections,
  summarizeSearchResultsBySource
} from './libraryState';
import type { CorridorItem } from './contentModel';
import type { MediaStateEntry } from './mediaState';

const createEntry = (overrides: Partial<MediaStateEntry>): MediaStateEntry => ({
  key: `movie:${overrides.snapshot?.id ?? 1}:::`,
  snapshot: {
    id: overrides.snapshot?.id ?? 1,
    mediaType: overrides.snapshot?.mediaType ?? 'movie',
    title: overrides.snapshot?.title ?? 'Sample',
    poster: overrides.snapshot?.poster ?? 'https://example.com/poster.jpg'
  },
  favorite: false,
  watchStatus: 'unwatched',
  progressSeconds: 0,
  durationSeconds: 0,
  progressPercent: 0,
  lastWatchedAt: null,
  ...overrides
});

const catalogMovie = (id: number, title: string): CorridorItem => ({
  id,
  title,
  poster: `https://example.com/${id}.jpg`,
  mediaType: 'movie'
});

test('deriveLibraryCollections builds favorites, history and continue watching distinctly', () => {
  const mediaStateMap = {
    a: createEntry({
      key: 'movie:1:::',
      snapshot: { id: 1, mediaType: 'movie', title: 'Movie A', poster: 'https://example.com/a.jpg' },
      favorite: true,
      watchStatus: 'watched',
      lastWatchedAt: 100
    }),
    b: createEntry({
      key: 'movie:2:::',
      snapshot: { id: 2, mediaType: 'movie', title: 'Movie B', poster: 'https://example.com/b.jpg' },
      favorite: true,
      watchStatus: 'in_progress',
      progressSeconds: 400,
      durationSeconds: 2000,
      progressPercent: 0.2,
      lastWatchedAt: 200
    }),
    c: createEntry({
      key: 'movie:3:::',
      snapshot: { id: 3, mediaType: 'movie', title: 'Movie C', poster: 'https://example.com/c.jpg' },
      watchStatus: 'in_progress',
      progressSeconds: 220,
      durationSeconds: 1800,
      progressPercent: 0.12,
      lastWatchedAt: 150
    })
  };

  const collections = deriveLibraryCollections({
    mediaStateMap,
    catalogItems: [catalogMovie(9, 'Catalog A')]
  });

  assert.deepEqual(collections.favorites.map((item) => item.title), ['Movie B', 'Movie A']);
  assert.deepEqual(collections.history.map((item) => item.title), ['Movie B', 'Movie C', 'Movie A']);
  assert.deepEqual(collections.continueWatching.map((item) => item.title), ['Movie B', 'Movie C']);
});

test('search pool prioritizes personal library before catalog and dedupes identities', () => {
  const mediaStateMap = {
    a: createEntry({
      key: 'movie:11:::',
      snapshot: { id: 11, mediaType: 'movie', title: 'Dune', poster: 'https://example.com/dune.jpg' },
      favorite: true,
      watchStatus: 'in_progress',
      progressSeconds: 300,
      durationSeconds: 1200,
      progressPercent: 0.25,
      lastWatchedAt: 10
    })
  };

  const collections = deriveLibraryCollections({
    mediaStateMap,
    catalogItems: [
      catalogMovie(11, 'Dune'),
      catalogMovie(12, 'Arrival')
    ]
  });

  assert.equal(collections.searchPool[0]?.title, 'Dune');
  assert.deepEqual(collections.searchPool.map((item) => item.title), ['Dune', 'Arrival']);
});

test('search result summaries classify results by source lookup', () => {
  const collections = deriveLibraryCollections({
    mediaStateMap: {
      a: createEntry({
        key: 'movie:21:::',
        snapshot: { id: 21, mediaType: 'movie', title: 'Blade Runner', poster: 'https://example.com/blade.jpg' },
        favorite: true,
        lastWatchedAt: 5
      })
    },
    catalogItems: [catalogMovie(22, 'Alien')]
  });

  const results = [catalogMovie(21, 'Blade Runner'), catalogMovie(22, 'Alien')];
  const summaries = summarizeSearchResultsBySource(results, collections.sourceLookup);

  assert.deepEqual(summaries, [
    { id: 'favorites', label: 'מועדפים', count: 1 },
    { id: 'catalog', label: 'קטלוג', count: 1 }
  ]);
  assert.equal(classifySearchSource(results[0], collections.sourceLookup), 'favorites');
  assert.equal(classifySearchSource(results[1], collections.sourceLookup), 'catalog');
});

test('telegram favorites round-trip into corridor collections', () => {
  const collections = deriveLibraryCollections({
    mediaStateMap: {
      a: createEntry({
        key: 'telegram_group:tg:group:42:::',
        snapshot: {
          id: 'tg:group:42',
          mediaType: 'telegram_group',
          title: 'Cinema Group',
          poster: 'data:image/svg+xml,%3Csvg/%3E',
          desc: 'Telegram Group'
        },
        favorite: true
      })
    },
    catalogItems: []
  });

  assert.equal(collections.favorites.length, 1);
  assert.equal(collections.favorites[0]?.mediaType, 'telegram_group');
  assert.equal(collections.favorites[0]?.title, 'Cinema Group');
});
