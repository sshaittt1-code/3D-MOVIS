import test from 'node:test';
import assert from 'node:assert/strict';
import { getSearchAliases, normalizeSearchText, rankSearchResults, shouldTriggerPredictiveSearch } from './searchNormalize';

test('normalizeSearchText handles Hebrew, punctuation, and case folding', () => {
  assert.equal(normalizeSearchText(' רִיק!! '), 'ריק');
  assert.equal(normalizeSearchText('Rick-and-Morty'), 'rick and morty');
  assert.equal(normalizeSearchText('  Breaking   Bad  '), 'breaking bad');
});

test('shouldTriggerPredictiveSearch starts at 3 visible characters', () => {
  assert.equal(shouldTriggerPredictiveSearch('ri'), false);
  assert.equal(shouldTriggerPredictiveSearch('rick'), true);
  assert.equal(shouldTriggerPredictiveSearch('ריק'), true);
});

test('getSearchAliases includes localized, original, and alternate titles', () => {
  const aliases = getSearchAliases({
    title: 'שובר שורות',
    originalTitle: 'Breaking Bad',
    alternateTitles: ['BrBa']
  });

  assert.deepEqual(aliases, ['שובר שורות', 'Breaking Bad', 'BrBa']);
});

test('rankSearchResults matches Hebrew and English aliases', () => {
  const items = [
    {
      id: 1,
      mediaType: 'tv',
      title: 'ריק ומורטי',
      originalTitle: 'Rick and Morty',
      alternateTitles: ['ריק מורטי'],
      popularity: 80
    },
    { id: 2, mediaType: 'movie', title: 'Rocky', originalTitle: 'Rocky', popularity: 60 }
  ];

  assert.equal(rankSearchResults(items, 'ריק')[0]?.id, 1);
  assert.equal(rankSearchResults(items, 'rick')[0]?.id, 1);
});

test('exact matches rank above weak partial matches', () => {
  const items = [
    { id: 1, mediaType: 'tv', title: 'Breaking Bad', originalTitle: 'Breaking Bad', popularity: 40 },
    { id: 2, mediaType: 'movie', title: 'Bad Boys', originalTitle: 'Bad Boys', popularity: 90 }
  ];

  assert.equal(rankSearchResults(items, 'Breaking Bad')[0]?.id, 1);
});
