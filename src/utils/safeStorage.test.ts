import test from 'node:test';
import assert from 'node:assert/strict';
import { safeGetJson, safeGetString, safeParseJson, safeRemove, safeSetJson, safeSetString } from './safeStorage';

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

test('safeParseJson falls back on malformed json', () => {
  assert.deepEqual(safeParseJson('{"ok":true}', {}), { ok: true });
  assert.deepEqual(safeParseJson('{broken', { ok: false }), { ok: false });
});

test('safe storage helpers persist and remove safely', () => {
  const storage = createStorage();
  safeSetJson(storage, 'state', { a: 1 });
  assert.deepEqual(safeGetJson(storage, 'state', {}), { a: 1 });
  safeSetString(storage, 'token', 'abc');
  assert.equal(safeGetString(storage, 'token', ''), 'abc');
  safeRemove(storage, 'token');
  assert.equal(safeGetString(storage, 'token', 'fallback'), 'fallback');
});
