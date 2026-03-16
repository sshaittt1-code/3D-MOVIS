import test from 'node:test';
import assert from 'node:assert/strict';
import { getActiveMenuItemId } from './menuConfig';

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
