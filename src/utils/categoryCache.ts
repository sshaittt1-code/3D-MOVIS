import { safeGetJson, safeSetJson } from './safeStorage';

export const CATEGORY_CACHE_STORAGE_KEY = 'category_cache_v1';
export const CATEGORY_CACHE_TTL_MS = 1000 * 60 * 15;
const FIVE_MINUTES_MS = 1000 * 60 * 5;
const THIRTY_MINUTES_MS = 1000 * 60 * 30;
const SIXTY_MINUTES_MS = 1000 * 60 * 60;
const MAX_CATEGORY_CACHE_ENTRIES = 60;

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export type CachedCategoryPage<T = any> = {
  items: T[];
  hasMore: boolean;
  storedAt: number;
};

export type CategoryCacheMap<T = any> = Record<string, CachedCategoryPage<T>>;

export const buildCategoryCacheKey = ({
  target,
  category,
  genreId,
  genreLabel,
  year,
  israeliOnly,
  page,
  batchSize,
  seed
}: {
  target: 'movies' | 'series' | 'israeli';
  category: string;
  genreId?: number | null;
  genreLabel?: string | null;
  year?: string | null;
  israeliOnly?: boolean;
  page: number;
  batchSize: number;
  seed?: number | null;
}) =>
  [
    target,
    category,
    genreId ?? 'all',
    genreLabel ?? 'all',
    year ?? 'all',
    israeliOnly ? 'he' : 'world',
    `page:${page}`,
    `batch:${batchSize}`,
    `seed:${seed ?? 'default'}`
  ].join('|');

export const readCategoryCacheMap = <T>(storage: StorageLike) =>
  safeGetJson<CategoryCacheMap<T>>(storage, CATEGORY_CACHE_STORAGE_KEY, {});

export const writeCategoryCacheMap = <T>(storage: StorageLike, cache: CategoryCacheMap<T>) => {
  safeSetJson(storage, CATEGORY_CACHE_STORAGE_KEY, cache);
};

export const getCacheTTL = ({
  category,
  year
}: {
  category: string;
  year?: string | number | null;
}): number => {
  if (category === 'random') return 0;
  if (['trending', 'new_releases', 'recently_active'].includes(category)) return FIVE_MINUTES_MS;

  const resolvedYear = Number.parseInt(String(year ?? category ?? ''), 10);
  if (Number.isInteger(resolvedYear) && resolvedYear <= 2024) {
    return SIXTY_MINUTES_MS;
  }

  if (['popular', 'top_rated'].includes(category)) return THIRTY_MINUTES_MS;
  return CATEGORY_CACHE_TTL_MS;
};

export const getCategoryCacheEntry = <T>(
  storage: StorageLike,
  cacheKey: string,
  now = Date.now(),
  ttlMs?: number,
  cacheContext?: { category: string; year?: string | number | null }
) => {
  const resolvedTtl = ttlMs ?? (cacheContext ? getCacheTTL(cacheContext) : CATEGORY_CACHE_TTL_MS);
  const cache = readCategoryCacheMap<T>(storage);
  const entry = cache[cacheKey];
  if (!entry) return null;
  if (resolvedTtl === 0) return null;
  if (now - entry.storedAt > resolvedTtl) return null;
  if (!Array.isArray(entry.items)) return null;
  return entry;
};

export const upsertCategoryCacheEntry = <T>(
  cache: CategoryCacheMap<T>,
  cacheKey: string,
  entry: Omit<CachedCategoryPage<T>, 'storedAt'> & { storedAt?: number }
) => {
  const next: CategoryCacheMap<T> = {
    ...cache,
    [cacheKey]: {
      items: Array.isArray(entry.items) ? entry.items : [],
      hasMore: Boolean(entry.hasMore),
      storedAt: entry.storedAt ?? Date.now()
    }
  };

  const sortedKeys = Object.keys(next).sort((left, right) => next[right].storedAt - next[left].storedAt);
  return sortedKeys.slice(0, MAX_CATEGORY_CACHE_ENTRIES).reduce<CategoryCacheMap<T>>((acc, key) => {
    acc[key] = next[key];
    return acc;
  }, {});
};

export const writeCategoryCacheEntry = <T>(
  storage: StorageLike,
  cacheKey: string,
  entry: Omit<CachedCategoryPage<T>, 'storedAt'> & { storedAt?: number }
) => {
  const cache = readCategoryCacheMap<T>(storage);
  writeCategoryCacheMap(storage, upsertCategoryCacheEntry(cache, cacheKey, entry));
};
