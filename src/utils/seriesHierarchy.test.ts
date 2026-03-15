import test from 'node:test';
import assert from 'node:assert/strict';
import type { CorridorItem, SeasonsNavContext } from './contentModel';
import {
  buildEpisodesNavContext,
  buildSeasonsNavContext,
  getCorridorScopeKey,
  getHierarchyMeta,
  getSeriesSelectionAction,
  stepOutOfNavContext
} from './seriesHierarchy';

const makeItem = (overrides: Partial<CorridorItem>): CorridorItem => ({
  id: 1,
  title: 'Sample',
  poster: 'https://example.com/poster.jpg',
  mediaType: 'movie',
  ...overrides
});

test('series hierarchy chooses nested corridor actions by media type', () => {
  assert.equal(getSeriesSelectionAction(makeItem({ mediaType: 'tv' })), 'openSeasons');
  assert.equal(getSeriesSelectionAction(makeItem({ mediaType: 'season' })), 'openEpisodes');
  assert.equal(getSeriesSelectionAction(makeItem({ mediaType: 'episode' })), 'openDetails');
  assert.equal(getSeriesSelectionAction(makeItem({ mediaType: 'movie' })), 'openDetails');
});

test('episodes nav context keeps its parent seasons corridor for back navigation', () => {
  const series = makeItem({ id: 77, title: 'Dark Matter', mediaType: 'tv' });
  const seasons = [makeItem({ id: 701, title: 'Season 1', mediaType: 'season', seasonNum: 1 })];
  const parent = buildSeasonsNavContext(series, seasons, 'Dark Matter');
  const episodes = [makeItem({ id: 9001, title: '1. Pilot', mediaType: 'episode', seasonNum: 1, episode_number: 1 })];
  const episodeContext = buildEpisodesNavContext(seasons[0], episodes, parent, 'Season 1');

  assert.equal(stepOutOfNavContext(episodeContext), parent);
  assert.equal(stepOutOfNavContext(parent), null);
});

test('corridor scope keys distinguish series and episode corridors', () => {
  const parent: SeasonsNavContext = {
    type: 'seasons',
    seriesId: 77,
    seriesTitle: 'Dark Matter',
    seasons: []
  };
  const episodes = buildEpisodesNavContext(
    makeItem({ id: 701, title: 'Season 1', mediaType: 'season', seasonNum: 1 }),
    [],
    parent,
    'Season 1'
  );

  assert.equal(getCorridorScopeKey('movies|popular', parent), 'seasons:77');
  assert.equal(getCorridorScopeKey('movies|popular', episodes), 'episodes:77:1');
  assert.equal(getCorridorScopeKey('movies|popular', null), 'movies|popular');
});

test('hierarchy meta describes the current nested corridor', () => {
  const series = buildSeasonsNavContext(makeItem({ id: 77, title: 'Dark Matter', mediaType: 'tv' }), [], 'Dark Matter');
  const episodes = buildEpisodesNavContext(
    makeItem({ id: 701, title: 'Season 1', mediaType: 'season', seasonNum: 1 }),
    [makeItem({ id: 9001, title: '1. Pilot', mediaType: 'episode', seasonNum: 1, episode_number: 1 })],
    series,
    'Season 1'
  );

  assert.deepEqual(getHierarchyMeta(series), {
    eyebrow: 'Series Corridor',
    title: 'Dark Matter',
    detail: '0 seasons',
    trail: 'Dark Matter'
  });
  assert.deepEqual(getHierarchyMeta(episodes), {
    eyebrow: 'Dark Matter',
    title: 'Season 1',
    detail: '1 episodes',
    trail: 'Dark Matter / Season 1'
  });
});
