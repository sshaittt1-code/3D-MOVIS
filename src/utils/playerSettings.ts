import { AUTOPLAY_STORAGE_KEY } from './mediaState';

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export const readAutoPlayNextEpisode = (storage: StorageLike, fallback = true) => {
  try {
    const stored = storage.getItem(AUTOPLAY_STORAGE_KEY);
    if (stored === null) return fallback;
    return stored === 'true';
  } catch {
    return fallback;
  }
};

export const writeAutoPlayNextEpisode = (storage: StorageLike, value: boolean) => {
  storage.setItem(AUTOPLAY_STORAGE_KEY, String(value));
};
