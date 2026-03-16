import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSideMenuGroups, buildSideMenuRoots } from './menuConfig';
import {
  buildDrawerEntries,
  getDefaultMenuControllerState,
  moveDrawerFocus,
  moveRailFocus,
  resolveMenuBackBehavior,
  syncMenuControllerState
} from './menuNavigation';

const createRoots = () =>
  buildSideMenuRoots(
    buildSideMenuGroups({
      movieGenres: [],
      seriesGenres: [],
      continueWatchingCount: 1,
      favoritesCount: 2,
      historyCount: 3,
      telegramCount: 4,
      telegramConnected: true
    }),
    { telegramConnected: true }
  );

test('syncMenuControllerState keeps a single expanded root and subgroup', () => {
  const roots = createRoots();
  const initial = getDefaultMenuControllerState(roots, 'root-movies', 'movies-popular');

  const synced = syncMenuControllerState(roots, {
    ...initial,
    railActiveRootId: 'root-series',
    expandedRootId: 'root-movies',
    expandedSubgroupId: 'movies-categories',
    focusedZone: 'drawer',
    focusedDrawerEntryId: 'movies-top-rated'
  }, {
    activeRootId: 'root-movies',
    activeItemId: 'movies-popular',
    isDrawerOpen: true
  });

  assert.equal(synced.railActiveRootId, 'root-series');
  assert.equal(synced.expandedRootId, 'root-series');
  assert.equal(synced.expandedSubgroupId, 'series-categories');
});

test('buildDrawerEntries only exposes items for the active subgroup', () => {
  const roots = createRoots();
  const moviesRoot = roots.find((root) => root.id === 'root-movies');
  assert.ok(moviesRoot);

  const entries = buildDrawerEntries(moviesRoot, 'movies-years');
  assert.ok(entries.some((entry) => entry.kind === 'subcategory' && entry.subgroupId === 'movies-years'));
  assert.ok(entries.some((entry) => entry.kind === 'item' && entry.id === 'movies-year-2024'));
  assert.equal(entries.some((entry) => entry.kind === 'item' && entry.id === 'movies-popular'), false);
});

test('moveRailFocus stays inside the root rail bounds', () => {
  const roots = createRoots();
  assert.equal(moveRailFocus(roots, 'root-search', -1), 'root-search');
  assert.equal(moveRailFocus(roots, 'root-search', 1), 'root-favorites');
});

test('moveDrawerFocus walks only visible drawer entries', () => {
  const roots = createRoots();
  const favoritesRoot = roots.find((root) => root.id === 'root-favorites');
  assert.ok(favoritesRoot);

  const entries = buildDrawerEntries(favoritesRoot, 'favorites-library');
  assert.equal(moveDrawerFocus(entries, entries[0]?.id ?? null, 1), 'quick-favorites');
});

test('resolveMenuBackBehavior collapses subgroup before closing drawer', () => {
  const roots = createRoots();
  const moviesRoot = roots.find((root) => root.id === 'root-movies');
  assert.ok(moviesRoot);

  assert.equal(resolveMenuBackBehavior(moviesRoot, {
    railActiveRootId: 'root-movies',
    expandedRootId: 'root-movies',
    expandedSubgroupId: 'movies-categories',
    focusedZone: 'drawer',
    focusedDrawerEntryId: 'movies-popular'
  }), 'collapse-subgroup');

  assert.equal(resolveMenuBackBehavior(moviesRoot, {
    railActiveRootId: 'root-movies',
    expandedRootId: 'root-movies',
    expandedSubgroupId: null,
    focusedZone: 'drawer',
    focusedDrawerEntryId: 'subgroup:root-movies:movies-categories'
  }), 'close-drawer');
});
