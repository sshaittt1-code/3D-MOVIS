import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCategoryCacheKey,
  getCategoryCacheEntry,
  upsertCategoryCacheEntry,
  writeCategoryCacheMap,
  readCategoryCacheMap
} from './categoryCache';

const createStorage = () => {
  const state = new Map<string, string>();
  return {
    getItem(key: string) {
      return state.has(key) ? state.get(key)! : null;
    },
    setItem(key: string, value: string) {
      state.set(key, value);
    },
    removeItem(key: string) {
      state.delete(key);
    }
  };
};

test('category cache key distinguishes category pages and filters', () => {
  const left = buildCategoryCacheKey({ target: 'movies', category: 'popular', page: 1, batchSize: 20, genreId: 28 });
  const right = buildCategoryCacheKey({ target: 'movies', category: 'popular', page: 2, batchSize: 20, genreId: 28 });
  const other = buildCategoryCacheKey({ target: 'series', category: 'popular', page: 1, batchSize: 20, genreLabel: 'Comedy' });
  assert.notEqual(left, right);
  assert.notEqual(left, other);
});

test('category cache respects ttl expiry', () => {
  const storage = createStorage();
  const cacheKey = buildCategoryCacheKey({ target: 'movies', category: 'popular', page: 1, batchSize: 20 });
  writeCategoryCacheMap(storage, upsertCategoryCacheEntry({}, cacheKey, { items: [{ id: 1 }], hasMore: true, storedAt: 1000 }));
  assert.equal(getCategoryCacheEntry(storage, cacheKey, 1005, 50)?.items.length, 1);
  assert.equal(getCategoryCacheEntry(storage, cacheKey, 1100, 50), null);
  assert.ok(readCategoryCacheMap(storage)[cacheKey]);
});
