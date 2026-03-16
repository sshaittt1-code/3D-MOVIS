import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSideMenuGroups, buildSideMenuRoots, getActiveMenuItemId, getRootIdForMenuItem } from './menuConfig';

test('getActiveMenuItemId keeps israeli as a standalone root section', () => {
  assert.equal(getActiveMenuItemId({
    librarySection: 'israeli',
    activeGenreId: null,
    seriesGenreFilter: null,
    yearFilter: 'all',
    movieCategory: 'popular',
    seriesCategory: 'popular',
    israeliCategory: 'popular',
    showSearch: false
  }), 'israeli-popular');
});

test('getActiveMenuItemId surfaces history and continue watching roots', () => {
  assert.equal(getActiveMenuItemId({
    librarySection: 'history',
    activeGenreId: null,
    seriesGenreFilter: null,
    yearFilter: 'all',
    movieCategory: 'popular',
    seriesCategory: 'popular',
    israeliCategory: 'popular',
    showSearch: false
  }), 'quick-history');

  assert.equal(getActiveMenuItemId({
    librarySection: 'continue_watching',
    activeGenreId: null,
    seriesGenreFilter: null,
    yearFilter: 'all',
    movieCategory: 'popular',
    seriesCategory: 'popular',
    israeliCategory: 'popular',
    showSearch: false
  }), 'quick-continue');
});

test('getActiveMenuItemId highlights telegram corridor filters', () => {
  assert.equal(getActiveMenuItemId({
    librarySection: 'telegram',
    activeGenreId: null,
    seriesGenreFilter: null,
    yearFilter: 'all',
    movieCategory: 'popular',
    seriesCategory: 'popular',
    israeliCategory: 'popular',
    telegramCategory: 'channels',
    showSearch: false
  }), 'telegram-channels');
});

test('buildSideMenuRoots reshapes the figma-style root menu with nested sections', () => {
  const groups = buildSideMenuGroups({
    movieGenres: [],
    seriesGenres: [],
    continueWatchingCount: 2,
    favoritesCount: 4,
    historyCount: 7,
    telegramCount: 3,
    telegramConnected: true
  });

  const roots = buildSideMenuRoots(groups, { telegramConnected: true });

  assert.deepEqual(roots.map((root) => root.id), [
    'root-search',
    'root-favorites',
    'root-movies',
    'root-series',
    'root-israeli',
    'root-telegram',
    'root-settings',
    'root-exit'
  ]);

  const moviesRoot = roots.find((root) => root.id === 'root-movies');
  assert.ok(moviesRoot);
  assert.deepEqual(moviesRoot.subgroups?.map((group) => group.id), [
    'movies-categories',
    'movies-years'
  ]);

  const favoritesRoot = roots.find((root) => root.id === 'root-favorites');
  assert.ok(favoritesRoot);
  assert.equal(favoritesRoot.subgroups?.[0]?.items.length, 3);
});

test('getRootIdForMenuItem maps nested menu items back to a single open root', () => {
  const groups = buildSideMenuGroups({
    movieGenres: [],
    seriesGenres: [],
    continueWatchingCount: 0,
    favoritesCount: 0,
    historyCount: 0,
    telegramCount: 0,
    telegramConnected: false
  });

  const roots = buildSideMenuRoots(groups, { telegramConnected: false });

  assert.equal(getRootIdForMenuItem(roots, 'movies-top-rated'), 'root-movies');
  assert.equal(getRootIdForMenuItem(roots, 'series-year-2024'), 'root-series');
  assert.equal(getRootIdForMenuItem(roots, 'quick-search'), 'root-search');
});
