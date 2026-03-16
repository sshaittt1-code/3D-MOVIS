import { CATEGORY_CACHE_STORAGE_KEY } from './categoryCache';
import { AUTOPLAY_STORAGE_KEY, MEDIA_STATE_STORAGE_KEY } from './mediaState';
import { PLAYBACK_CACHE_STORAGE_KEY } from './playbackCache';
import { POSTER_BATCH_SIZE_STORAGE_KEY } from './posterBatchSettings';
import { safeGetString, safeRemove, safeSetString } from './safeStorage';

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export const STORAGE_SCHEMA_VERSION_KEY = 'hc_storage_schema_version';
export const STORAGE_SCHEMA_VERSION = '3';
export const LAST_GOOD_FEED_STORAGE_KEY = 'last_good_feed_v1';
export const DEFAULT_API_BASE_URL = 'https://holocinema-api-ficosyc5ua-ew.a.run.app';

export const PERSISTED_STORAGE_KEYS = {
  schemaVersion: STORAGE_SCHEMA_VERSION_KEY,
  telegramSession: 'tg_session',
  apiBase: 'api_base',
  mediaState: MEDIA_STATE_STORAGE_KEY,
  categoryCache: CATEGORY_CACHE_STORAGE_KEY,
  playbackCache: PLAYBACK_CACHE_STORAGE_KEY,
  autoplay: AUTOPLAY_STORAGE_KEY,
  posterBatchSize: POSTER_BATCH_SIZE_STORAGE_KEY,
  lastGoodFeed: LAST_GOOD_FEED_STORAGE_KEY,
  corridorDebug: 'hc_corridor_debug'
} as const;

const LEGACY_KEY_MIGRATIONS: Array<{ from: string; to: string }> = [
  { from: 'tg_session_string', to: PERSISTED_STORAGE_KEYS.telegramSession },
  { from: 'api_base_url', to: PERSISTED_STORAGE_KEYS.apiBase }
];

const STALE_API_BASES = new Set([
  'https://threed-movis.onrender.com',
  'https://holocinema-api-545560686289.europe-west1.run.app'
]);

export type StorageContractResult = {
  schemaVersion: string;
  migratedKeys: string[];
};

export const getPersistedUserStateKeys = () => [
  PERSISTED_STORAGE_KEYS.telegramSession,
  PERSISTED_STORAGE_KEYS.mediaState,
  PERSISTED_STORAGE_KEYS.categoryCache,
  PERSISTED_STORAGE_KEYS.playbackCache,
  PERSISTED_STORAGE_KEYS.autoplay,
  PERSISTED_STORAGE_KEYS.posterBatchSize,
  PERSISTED_STORAGE_KEYS.lastGoodFeed,
  PERSISTED_STORAGE_KEYS.apiBase
];

export const ensurePersistedStorageContract = (storage: StorageLike): StorageContractResult => {
  const migratedKeys: string[] = [];

  for (const migration of LEGACY_KEY_MIGRATIONS) {
    const currentValue = safeGetString(storage, migration.to, '');
    const legacyValue = safeGetString(storage, migration.from, '');
    if (!currentValue && legacyValue) {
      safeSetString(storage, migration.to, legacyValue);
      migratedKeys.push(`${migration.from}->${migration.to}`);
    }
    if (legacyValue) {
      safeRemove(storage, migration.from);
    }
  }

  const currentApiBase = safeGetString(storage, PERSISTED_STORAGE_KEYS.apiBase, '').trim();
  if (!currentApiBase || STALE_API_BASES.has(currentApiBase)) {
    safeSetString(storage, PERSISTED_STORAGE_KEYS.apiBase, DEFAULT_API_BASE_URL);
    if (currentApiBase !== DEFAULT_API_BASE_URL) {
      migratedKeys.push(`${PERSISTED_STORAGE_KEYS.apiBase}->${DEFAULT_API_BASE_URL}`);
    }
  }

  const currentSchemaVersion = safeGetString(storage, STORAGE_SCHEMA_VERSION_KEY, '');
  if (currentSchemaVersion !== STORAGE_SCHEMA_VERSION) {
    safeSetString(storage, STORAGE_SCHEMA_VERSION_KEY, STORAGE_SCHEMA_VERSION);
  }

  return {
    schemaVersion: STORAGE_SCHEMA_VERSION,
    migratedKeys
  };
};
