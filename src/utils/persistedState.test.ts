import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_API_BASE_URL,
  ensurePersistedStorageContract,
  getPersistedUserStateKeys,
  PERSISTED_STORAGE_KEYS,
  sanitizePersistedApiBase,
  STORAGE_SCHEMA_VERSION,
  STORAGE_SCHEMA_VERSION_KEY
} from './persistedState';
import { DEFAULT_API_BASE, resolveApiBase } from './apiBase';

const createStorage = (initial: Record<string, string> = {}) => {
  const state = new Map<string, string>(Object.entries(initial));
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

test('ensurePersistedStorageContract migrates legacy keys and stamps schema version', () => {
  const storage = createStorage({
    tg_session_string: 'legacy-session',
    api_base_url: 'https://legacy.example.com'
  });

  const result = ensurePersistedStorageContract(storage);

  assert.equal(result.schemaVersion, STORAGE_SCHEMA_VERSION);
  assert.deepEqual(result.migratedKeys.sort(), [
    'api_base_url->api_base',
    'tg_session_string->tg_session'
  ]);
  assert.equal(storage.getItem(PERSISTED_STORAGE_KEYS.telegramSession), 'legacy-session');
  assert.equal(storage.getItem(PERSISTED_STORAGE_KEYS.apiBase), 'https://legacy.example.com');
  assert.equal(storage.getItem(STORAGE_SCHEMA_VERSION_KEY), STORAGE_SCHEMA_VERSION);
  assert.equal(storage.getItem('tg_session_string'), null);
  assert.equal(storage.getItem('api_base_url'), null);
});

test('ensurePersistedStorageContract upgrades stale api base urls to the current render backend', () => {
  const storage = createStorage({
    [PERSISTED_STORAGE_KEYS.apiBase]: 'https://holocinema-api-545560686289.europe-west1.run.app'
  });

  const result = ensurePersistedStorageContract(storage);

  assert.equal(result.schemaVersion, STORAGE_SCHEMA_VERSION);
  assert.equal(storage.getItem(PERSISTED_STORAGE_KEYS.apiBase), DEFAULT_API_BASE_URL);
});

test('resolveApiBase never falls back to window origin and prefers configured render default', () => {
  assert.equal(resolveApiBase(), DEFAULT_API_BASE);
});

test('sanitizePersistedApiBase rejects invalid non-http api bases', () => {
  assert.equal(sanitizePersistedApiBase('capacitor://localhost'), DEFAULT_API_BASE);
});

test('resolveApiBase accepts legacy storage keys but normalizes them to the managed backend', () => {
  const storage = createStorage({
    backendUrl: 'https://holocinema-api-ficosyc5ua-ew.a.run.app'
  });

  assert.equal(resolveApiBase(storage), DEFAULT_API_BASE);
});

test('ensurePersistedStorageContract canonicalizes legacy api base keys into api_base', () => {
  const storage = createStorage({
    backendUrl: 'https://holocinema-api-545560686289.europe-west1.run.app'
  });

  ensurePersistedStorageContract(storage);

  assert.equal(storage.getItem(PERSISTED_STORAGE_KEYS.apiBase), DEFAULT_API_BASE);
  assert.equal(storage.getItem('backendUrl'), null);
});

test('getPersistedUserStateKeys exposes the user data that must survive updates', () => {
  assert.deepEqual(getPersistedUserStateKeys(), [
    PERSISTED_STORAGE_KEYS.telegramSession,
    PERSISTED_STORAGE_KEYS.mediaState,
    PERSISTED_STORAGE_KEYS.categoryCache,
    PERSISTED_STORAGE_KEYS.playbackCache,
    PERSISTED_STORAGE_KEYS.autoplay,
    PERSISTED_STORAGE_KEYS.posterBatchSize,
    PERSISTED_STORAGE_KEYS.lastGoodFeed,
    PERSISTED_STORAGE_KEYS.apiBase
  ]);
});
