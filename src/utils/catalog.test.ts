import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCatalogFilters, getUniqueGenres, shuffleItems } from './catalog';

const sampleItems = [
  { id: 1, title: 'Alpha', genre: 'Drama, Action', rating: 7.2, popularity: 120, year: 2024 },
  { id: 2, title: 'Bravo', genre: 'Comedy', rating: 8.9, popularity: 40, year: 2021 },
  { id: 3, title: 'Charlie', genre: 'Drama', rating: 6.5, popularity: 80, year: 2014 }
];

test('applyCatalogFilters sorts by rating and filters by year', () => {
  const filtered = applyCatalogFilters(sampleItems, {
    sortMode: 'rating',
    yearFilter: '2020s'
  });

  assert.deepEqual(filtered.map((item) => item.id), [2, 1]);
});

test('applyCatalogFilters supports deterministic random ordering', () => {
  const first = shuffleItems(sampleItems, 42).map((item) => item.id);
  const second = shuffleItems(sampleItems, 42).map((item) => item.id);
  assert.deepEqual(first, second);
});

test('getUniqueGenres flattens and deduplicates comma-separated genres', () => {
  assert.deepEqual(getUniqueGenres(sampleItems), ['Drama', 'Action', 'Comedy']);
});
