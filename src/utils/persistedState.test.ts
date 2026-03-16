import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_API_BASE_URL,
  ensurePersistedStorageContract,
  getPersistedUserStateKeys,
  PERSISTED_STORAGE_KEYS,
  resolvePreferredApiBase,
  sanitizePersistedApiBase,
  STORAGE_SCHEMA_VERSION,
  STORAGE_SCHEMA_VERSION_KEY
} from './persistedState';

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

test('ensurePersistedStorageContract upgrades stale api base urls to the current cloud run backend', () => {
  const storage = createStorage({
    [PERSISTED_STORAGE_KEYS.apiBase]: 'https://threed-movis.onrender.com'
  });

  const result = ensurePersistedStorageContract(storage, {
    origin: null,
    protocol: null
  });

  assert.equal(result.schemaVersion, STORAGE_SCHEMA_VERSION);
  assert.equal(storage.getItem(PERSISTED_STORAGE_KEYS.apiBase), DEFAULT_API_BASE_URL);
});

test('resolvePreferredApiBase prefers same-origin http runtimes for browser flows', () => {
  assert.equal(resolvePreferredApiBase({
    origin: 'http://127.0.0.1:3000',
    protocol: 'http:'
  }), 'http://127.0.0.1:3000');
});

test('sanitizePersistedApiBase replaces managed remote bases with same-origin browser hosts', () => {
  assert.equal(
    sanitizePersistedApiBase('https://holocinema-api-545560686289.europe-west1.run.app', {
      origin: 'http://127.0.0.1:3000',
      protocol: 'http:'
    }),
    'http://127.0.0.1:3000'
  );
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
