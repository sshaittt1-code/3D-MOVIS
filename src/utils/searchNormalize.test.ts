import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSearchText, rankSearchResults, shouldTriggerPredictiveSearch } from './searchNormalize';

test('normalizeSearchText handles Hebrew, punctuation, and case folding', () => {
  assert.equal(normalizeSearchText(' רִיק!! '), 'ריק');
  assert.equal(normalizeSearchText('Rick-and-Morty'), 'rick and morty');
});

test('shouldTriggerPredictiveSearch starts at 3 visible characters', () => {
  assert.equal(shouldTriggerPredictiveSearch('ri'), false);
  assert.equal(shouldTriggerPredictiveSearch('rick'), true);
  assert.equal(shouldTriggerPredictiveSearch('ריק'), true);
});

test('rankSearchResults matches Hebrew and English aliases', () => {
  const items = [
    { id: 1, mediaType: 'tv', title: 'ריק ומורטי', originalTitle: 'Rick and Morty', popularity: 80 },
    { id: 2, mediaType: 'movie', title: 'Rocky', originalTitle: 'Rocky', popularity: 60 }
  ];

  assert.equal(rankSearchResults(items, 'ריק')[0]?.id, 1);
  assert.equal(rankSearchResults(items, 'rick')[0]?.id, 1);
});
