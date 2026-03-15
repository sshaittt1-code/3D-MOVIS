import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FALLBACK_LIBRARY,
  getCatalogFallbackMediaType,
  mergeCorridorItems,
  normalizeCatalogPage,
  normalizeCatalogResponse,
  normalizeCorridorItem,
  normalizeEpisodePage,
  normalizeSeasonPage
} from './contentModel';

test('normalizeCorridorItem canonicalizes posters and media type aliases', () => {
  const item = normalizeCorridorItem({
    id: 7,
    title: 'Alias Test',
    posterThumb: 'https://example.com/thumb.jpg',
    mediaType: 'series'
  }, 'movie');

  assert.ok(item);
  assert.equal(item?.poster, 'https://example.com/thumb.jpg');
  assert.equal(item?.posterThumb, 'https://example.com/thumb.jpg');
  assert.equal(item?.mediaType, 'tv');
});

test('normalizeCatalogResponse extracts the correct envelope by target', () => {
  const movies = normalizeCatalogResponse({
    movies: [{ id: 1, title: 'Movie', poster: 'https://example.com/movie.jpg' }],
    hasMore: true
  }, 'movies');
  const series = normalizeCatalogResponse({
    series: [{ id: 2, title: 'Series', poster: 'https://example.com/series.jpg', mediaType: 'tv' }],
    hasMore: false
  }, 'series');
  const israeli = normalizeCatalogResponse({
    items: [{ id: 3, title: 'Israeli', poster: 'https://example.com/israeli.jpg', mediaType: 'movie' }],
    hasMore: true
  }, 'israeli');

  assert.equal(movies.items[0]?.mediaType, 'movie');
  assert.equal(movies.hasMore, true);
  assert.equal(series.items[0]?.mediaType, 'tv');
  assert.equal(series.hasMore, false);
  assert.equal(israeli.items[0]?.title, 'Israeli');
});

test('normalizeSeasonPage enriches seasons with series identity', () => {
  const seasons = normalizeSeasonPage([
    {
      id: 10,
      title: 'Season 1',
      season_number: 1,
      poster: 'https://example.com/season.jpg',
      episode_count: 8
    }
  ], { seriesId: 99, seriesTitle: 'Dark Matter' });

  assert.equal(seasons.length, 1);
  assert.equal(seasons[0]?.mediaType, 'season');
  assert.equal(seasons[0]?.seriesId, 99);
  assert.equal(seasons[0]?.seriesTitle, 'Dark Matter');
  assert.equal(seasons[0]?.seasonNum, 1);
});

test('normalizeEpisodePage enriches episodes with season identity', () => {
  const episodes = normalizeEpisodePage([
    {
      id: 11,
      title: '1. Pilot',
      episode_number: 1,
      poster: 'https://example.com/episode.jpg'
    }
  ], {
    seriesId: 99,
    seriesTitle: 'Dark Matter',
    seasonNum: 1,
    seasonTitle: 'Season 1'
  });

  assert.equal(episodes.length, 1);
  assert.equal(episodes[0]?.mediaType, 'episode');
  assert.equal(episodes[0]?.seriesId, 99);
  assert.equal(episodes[0]?.seasonNum, 1);
  assert.equal(episodes[0]?.seasonTitle, 'Season 1');
});

test('mergeCorridorItems still deduplicates by media type and id', () => {
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

test('catalog fallback media types remain isolated by root target', () => {
  assert.equal(getCatalogFallbackMediaType('movies'), 'movie');
  assert.equal(getCatalogFallbackMediaType('series'), 'tv');
  assert.equal(getCatalogFallbackMediaType('israeli'), 'movie');
});

test('fallback library stays populated for all root catalogs', () => {
  assert.ok(normalizeCatalogPage(FALLBACK_LIBRARY.movies, 'movie').length >= 8);
  assert.ok(normalizeCatalogPage(FALLBACK_LIBRARY.series, 'tv').length >= 4);
  assert.ok(normalizeCatalogPage(FALLBACK_LIBRARY.israeli, 'movie').length >= 3);
});
