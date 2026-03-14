type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export const safeParseJson = <T>(value: string | null, fallback: T) => {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

export const safeGetJson = <T>(storage: StorageLike, key: string, fallback: T) => {
  try {
    return safeParseJson(storage.getItem(key), fallback);
  } catch {
    return fallback;
  }
};

export const safeGetString = (storage: StorageLike, key: string, fallback = '') => {
  try {
    const value = storage.getItem(key);
    return value === null ? fallback : value;
  } catch {
    return fallback;
  }
};

export const safeSetJson = (storage: StorageLike, key: string, value: unknown) => {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {}
};

export const safeSetString = (storage: StorageLike, key: string, value: string) => {
  try {
    storage.setItem(key, value);
  } catch {}
};

export const safeRemove = (storage: StorageLike, key: string) => {
  try {
    storage.removeItem(key);
  } catch {}
};
