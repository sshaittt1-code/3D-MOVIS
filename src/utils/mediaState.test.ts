import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMediaKey, deriveWatchStatus, migrateLegacyMediaState, updateProgressState } from './mediaState';

const episode = {
  id: 17,
  mediaType: 'episode',
  title: 'Episode 3',
  seriesId: 99,
  seasonNum: 2,
  episode_number: 3
};

test('buildMediaKey distinguishes episodic identity', () => {
  assert.equal(buildMediaKey(episode), 'episode:17:99:2:3');
});

test('deriveWatchStatus maps progress to correct states', () => {
  assert.equal(deriveWatchStatus(0, 3600), 'unwatched');
  assert.equal(deriveWatchStatus(120, 3600), 'in_progress');
  assert.equal(deriveWatchStatus(3400, 3600), 'watched');
});

test('updateProgressState keeps snapshot and computed percent in sync', () => {
  const updated = updateProgressState(episode, undefined, 180, 1200);
  assert.equal(updated.watchStatus, 'in_progress');
  assert.equal(updated.progressPercent, 0.15);
  assert.equal(updated.snapshot.title, 'Episode 3');
});

test('migrateLegacyMediaState merges favorites and history', () => {
  const migrated = migrateLegacyMediaState([{ ...episode }], [{ ...episode, watchedAt: 123, watchStatus: 'watched' }]);
  const entry = migrated[buildMediaKey(episode)];
  assert.equal(entry.favorite, true);
  assert.equal(entry.watchStatus, 'watched');
  assert.equal(entry.lastWatchedAt, 123);
});
