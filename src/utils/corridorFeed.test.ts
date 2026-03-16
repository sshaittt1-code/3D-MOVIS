import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FALLBACK_LIBRARY,
  buildRootRequestKey,
  getActiveGenreFilterForSection,
  mergeCorridorItems,
  normalizeCatalogPage,
  normalizeCorridorItem,
  resolveRootRouteState
} from './corridorFeed';

test('normalizeCorridorItem falls back from posterThumb to poster', () => {
  const item = normalizeCorridorItem({
    id: 1,
    title: 'Fallback Poster',
    posterThumb: 'https://example.com/thumb.jpg',
    mediaType: 'movie'
  }, 'movie');

  assert.ok(item);
  assert.equal(item?.poster, 'https://example.com/thumb.jpg');
  assert.equal(item?.posterThumb, 'https://example.com/thumb.jpg');
  assert.equal(item?.mediaType, 'movie');
});

test('normalizeCatalogPage drops items without a usable poster', () => {
  const normalized = normalizeCatalogPage([
    { id: 1, title: 'Visible', poster: 'https://example.com/poster.jpg' },
    { id: 2, title: 'Hidden' }
  ], 'movie');

  assert.equal(normalized.length, 1);
  assert.equal(normalized[0]?.title, 'Visible');
});

test('getActiveGenreFilterForSection only applies series genre filtering to series', () => {
  assert.equal(getActiveGenreFilterForSection('series', 'Drama'), 'Drama');
  assert.equal(getActiveGenreFilterForSection('all', 'Drama'), null);
  assert.equal(getActiveGenreFilterForSection('israeli', 'Drama'), null);
});

test('resolveRootRouteState clears irrelevant filters when switching to movies', () => {
  const next = resolveRootRouteState({ target: 'movies', category: 'trending', genreId: 28, year: '2025' });
  assert.deepEqual(next, {
    librarySection: 'all',
    movieCategory: 'trending',
    movieGenreId: 28,
    seriesGenreFilter: null,
    yearFilter: '2025',
    refreshShuffle: false
  });
});

test('resolveRootRouteState clears irrelevant filters when switching to series', () => {
  const next = resolveRootRouteState({ target: 'series', category: 'random', genreLabel: 'Comedy' });
  assert.deepEqual(next, {
    librarySection: 'series',
    seriesCategory: 'random',
    movieGenreId: null,
    seriesGenreFilter: 'Comedy',
    yearFilter: 'all',
    refreshShuffle: true
  });
});

test('resolveRootRouteState supports telegram dialog categories', () => {
  const next = resolveRootRouteState({ target: 'telegram', category: 'channels' });
  assert.deepEqual(next, {
    librarySection: 'telegram',
    telegramCategory: 'channels',
    movieGenreId: null,
    seriesGenreFilter: null,
    yearFilter: 'all',
    refreshShuffle: false
  });
});

test('resolveRootRouteState ignores library-only routes', () => {
  assert.equal(resolveRootRouteState({ target: 'favorites' }), null);
  assert.equal(resolveRootRouteState({ target: 'history' }), null);
  assert.equal(resolveRootRouteState({ target: 'continue_watching' }), null);
  assert.equal(resolveRootRouteState({ target: 'search' }), null);
});

test('buildRootRequestKey stays isolated across root datasets', () => {
  const movies = buildRootRequestKey({ target: 'movies', category: 'popular', genreId: 28, year: '2025' });
  const series = buildRootRequestKey({ target: 'series', category: 'popular', year: '2025' });
  const israeli = buildRootRequestKey({ target: 'israeli', category: 'popular', year: '2025' });
  const telegram = buildRootRequestKey({ target: 'telegram', category: 'channels', year: 'all' });
  assert.notEqual(movies, series);
  assert.notEqual(movies, israeli);
  assert.notEqual(series, israeli);
  assert.notEqual(telegram, movies);
  assert.notEqual(telegram, series);
});

test('mergeCorridorItems deduplicates by media type and id', () => {
  const merged = mergeCorridorItems(
    [{ id: 1, title: 'A', poster: 'https://example.com/a.jpg', mediaType: 'movie' }],
    [
      { id: 1, title: 'A latest', poster: 'https://example.com/a-2.jpg', mediaType: 'movie' },
      { id: 1, title: 'A series', poster: 'https://example.com/a-tv.jpg', mediaType: 'tv' }
    ]
  );

  assert.equal(merged.length, 2);
  assert.equal(merged[0]?.title, 'A latest');
  assert.equal(merged[1]?.title, 'A series');
});

test('fallback library ships visible starter content for all root sections', () => {
  assert.ok(FALLBACK_LIBRARY.movies.length >= 8);
  assert.ok(FALLBACK_LIBRARY.series.length >= 4);
  assert.ok(FALLBACK_LIBRARY.israeli.length >= 3);
  assert.ok(FALLBACK_LIBRARY.movies.every((item) => item.poster));
});
