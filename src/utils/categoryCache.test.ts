import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCategoryCacheKey,
  compactCategoryCacheStorage,
  getCategoryCacheEntry,
  parseCategoryCacheKey,
  pruneCategoryCacheMap,
  upsertCategoryCacheEntry,
  writeCategoryCacheEntry,
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
  const israeli = buildCategoryCacheKey({ target: 'israeli', category: 'popular', page: 1, batchSize: 20 });
  const randomSeed = buildCategoryCacheKey({ target: 'movies', category: 'random', page: 1, batchSize: 20, seed: 123 });
  const randomSeedOther = buildCategoryCacheKey({ target: 'movies', category: 'random', page: 1, batchSize: 20, seed: 456 });
  assert.notEqual(left, right);
  assert.notEqual(left, other);
  assert.notEqual(left, israeli);
  assert.notEqual(randomSeed, randomSeedOther);
});

test('category cache respects ttl expiry', () => {
  const storage = createStorage();
  const cacheKey = buildCategoryCacheKey({ target: 'movies', category: 'popular', page: 1, batchSize: 20 });
  writeCategoryCacheMap(storage, upsertCategoryCacheEntry({}, cacheKey, { items: [{ id: 1 }], hasMore: true, storedAt: 1000 }));
  assert.equal(getCategoryCacheEntry(storage, cacheKey, 1005, 50)?.items.length, 1);
  assert.equal(getCategoryCacheEntry(storage, cacheKey, 1100, 50), null);
  assert.ok(readCategoryCacheMap(storage)[cacheKey]);
});

test('category cache key parser restores cache context', () => {
  const cacheKey = buildCategoryCacheKey({
    target: 'series',
    category: 'recently_active',
    page: 2,
    batchSize: 20,
    year: 2024,
    seed: 123
  });

  assert.deepEqual(parseCategoryCacheKey(cacheKey), {
    target: 'series',
    category: 'recently_active',
    genreId: 'all',
    genreLabel: 'all',
    year: '2024',
    language: 'world',
    pageToken: 'page:2',
    batchToken: 'batch:20',
    seedToken: 'seed:123'
  });
});

test('pruneCategoryCacheMap drops expired and random entries', () => {
  const popularKey = buildCategoryCacheKey({ target: 'movies', category: 'popular', page: 1, batchSize: 20 });
  const expiredTrendingKey = buildCategoryCacheKey({ target: 'movies', category: 'trending', page: 1, batchSize: 20 });
  const randomKey = buildCategoryCacheKey({ target: 'movies', category: 'random', page: 1, batchSize: 20, seed: 1 });

  const pruned = pruneCategoryCacheMap({
    [popularKey]: { items: [{ id: 1 }], hasMore: true, storedAt: 1000 },
    [expiredTrendingKey]: { items: [{ id: 2 }], hasMore: true, storedAt: 1000 },
    [randomKey]: { items: [{ id: 3 }], hasMore: true, storedAt: 1000 }
  }, 1000 + (1000 * 60 * 10));

  assert.deepEqual(Object.keys(pruned), [popularKey]);
});

test('compactCategoryCacheStorage rewrites storage with only live entries', () => {
  const storage = createStorage();
  const liveKey = buildCategoryCacheKey({ target: 'movies', category: 'popular', page: 1, batchSize: 20 });
  const deadKey = buildCategoryCacheKey({ target: 'movies', category: 'random', page: 1, batchSize: 20, seed: 1 });

  writeCategoryCacheMap(storage, {
    [liveKey]: { items: [{ id: 1 }], hasMore: true, storedAt: 1000 },
    [deadKey]: { items: [{ id: 2 }], hasMore: true, storedAt: 1000 }
  });

  const compacted = compactCategoryCacheStorage(storage, 1200);

  assert.deepEqual(Object.keys(compacted), [liveKey]);
  assert.deepEqual(Object.keys(readCategoryCacheMap(storage)), [liveKey]);
});

test('writeCategoryCacheEntry skips random catalog pages', () => {
  const storage = createStorage();
  const randomKey = buildCategoryCacheKey({ target: 'movies', category: 'random', page: 1, batchSize: 20, seed: 42 });

  writeCategoryCacheEntry(storage, randomKey, { items: [{ id: 1 }], hasMore: true });

  assert.deepEqual(readCategoryCacheMap(storage), {});
});
