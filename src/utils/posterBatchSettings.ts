export const POSTER_BATCH_SIZE_STORAGE_KEY = 'poster_batch_size_v1';
export const DEFAULT_POSTER_BATCH_SIZE = 20;
export const MIN_POSTER_BATCH_SIZE = 10;
export const MAX_POSTER_BATCH_SIZE = 40;
export const POSTER_BATCH_SIZE_OPTIONS = [10, 20, 30, 40] as const;

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export const normalizePosterBatchSize = (value: unknown, fallback = DEFAULT_POSTER_BATCH_SIZE) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  const bounded = Math.max(MIN_POSTER_BATCH_SIZE, Math.min(MAX_POSTER_BATCH_SIZE, parsed));
  return POSTER_BATCH_SIZE_OPTIONS.includes(bounded as (typeof POSTER_BATCH_SIZE_OPTIONS)[number])
    ? bounded
    : fallback;
};

export const readPosterBatchSize = (storage: StorageLike, fallback = DEFAULT_POSTER_BATCH_SIZE) => {
  try {
    return normalizePosterBatchSize(storage.getItem(POSTER_BATCH_SIZE_STORAGE_KEY), fallback);
  } catch {
    return fallback;
  }
};

export const writePosterBatchSize = (storage: StorageLike, value: number) => {
  try {
    storage.setItem(POSTER_BATCH_SIZE_STORAGE_KEY, String(normalizePosterBatchSize(value)));
  } catch {}
};
