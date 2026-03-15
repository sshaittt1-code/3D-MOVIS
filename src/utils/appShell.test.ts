import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_ROOT_CATALOG_STATE,
  resolveAppBackAction,
  resolveAppShellLayer,
  type AppShellSnapshot
} from './appShell';

const baseSnapshot = (): AppShellSnapshot => ({
  hasActiveMedia: false,
  hasPosterContextMovie: false,
  hasSelectedMovie: false,
  showCinemaScreen: false,
  showSearch: false,
  hasNavContext: false,
  showSettings: false,
  isSidebarOpen: false
});

test('default root catalog state launches into Movies Popular', () => {
  assert.deepEqual(DEFAULT_ROOT_CATALOG_STATE, {
    librarySection: 'all',
    sortMode: 'feed',
    yearFilter: 'all',
    seriesGenreFilter: null,
    movieGenreId: null,
    movieCategory: 'popular',
    seriesCategory: 'popular',
    israeliCategory: 'popular'
  });
});

test('settings outranks selected movie in shell layering', () => {
  const layer = resolveAppShellLayer({
    ...baseSnapshot(),
    hasSelectedMovie: true,
    showSettings: true
  });

  assert.equal(layer, 'settings');
  assert.equal(resolveAppBackAction({
    ...baseSnapshot(),
    hasSelectedMovie: true,
    showSettings: true
  }), 'closeSettings');
});

test('cinema screen sits above movie details', () => {
  assert.equal(resolveAppShellLayer({
    ...baseSnapshot(),
    hasSelectedMovie: true,
    showCinemaScreen: true
  }), 'cinema');
});

test('sidebar toggles correctly through back actions', () => {
  assert.equal(resolveAppBackAction(baseSnapshot()), 'openSidebar');
  assert.equal(resolveAppBackAction({
    ...baseSnapshot(),
    isSidebarOpen: true
  }), 'closeSidebar');
});

test('player remains the highest-priority shell layer', () => {
  assert.equal(resolveAppBackAction({
    ...baseSnapshot(),
    hasActiveMedia: true,
    showSettings: true,
    hasSelectedMovie: true
  }), 'closePlayer');
});
