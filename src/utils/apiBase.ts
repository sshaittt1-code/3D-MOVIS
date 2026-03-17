import { safeGetString, safeRemove, safeSetString } from './safeStorage';

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export const DEFAULT_API_BASE = 'https://threed-movis.onrender.com';

export const API_BASE_STORAGE_KEYS = [
  'api_base',
  'apiBase',
  'serverUrl',
  'backendUrl',
  'api_base_url'
] as const;

const STALE_API_BASES = new Set([
  'https://holocinema-api-545560686289.europe-west1.run.app',
  'https://holocinema-api-ficosyc5ua-ew.a.run.app'
]);

const normalizeApiBase = (value: string | null | undefined) => String(value || '').trim().replace(/\/+$/, '');

export const isValidApiBase = (value: string | null | undefined) => /^https?:\/\//i.test(normalizeApiBase(value));

export const sanitizeApiBase = (value: string | null | undefined) => {
  const normalizedValue = normalizeApiBase(value);
  if (!normalizedValue || STALE_API_BASES.has(normalizedValue) || !isValidApiBase(normalizedValue)) {
    return DEFAULT_API_BASE;
  }

  return normalizedValue;
};

export const readStoredApiBase = (storage: StorageLike) => {
  for (const key of API_BASE_STORAGE_KEYS) {
    const candidate = safeGetString(storage, key, '');
    if (candidate.trim()) {
      return candidate;
    }
  }

  return '';
};

export const resolveApiBase = (storage?: StorageLike | null) => {
  const storedBase = storage ? readStoredApiBase(storage) : '';

  if (storedBase.trim()) {
    return sanitizeApiBase(storedBase);
  }

  return sanitizeApiBase(
    (typeof import.meta !== 'undefined' && (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env)
      ? ((import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.VITE_API_BASE
        || (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.VITE_API_BASE_URL
        || DEFAULT_API_BASE)
      : DEFAULT_API_BASE
  );
};

export const persistResolvedApiBase = (storage: StorageLike, nextBase: string) => {
  const sanitized = sanitizeApiBase(nextBase);
  safeSetString(storage, 'api_base', sanitized);

  for (const key of API_BASE_STORAGE_KEYS) {
    if (key !== 'api_base') {
      safeRemove(storage, key);
    }
  }

  return sanitized;
};
