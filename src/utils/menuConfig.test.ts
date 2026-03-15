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
