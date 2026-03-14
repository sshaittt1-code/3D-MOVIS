import test from 'node:test';
import assert from 'node:assert/strict';
import { AUTOPLAY_PRELOAD_SECONDS, findNextEpisodeInSeason, findNextSeason, shouldPrepareNextEpisode } from './nextEpisode';

const episodes = [
  { id: 1, episode_number: 1 },
  { id: 2, episode_number: 2 },
  { id: 3, episode_number: 3 }
];

test('findNextEpisodeInSeason returns the next numbered episode', () => {
  assert.deepEqual(findNextEpisodeInSeason(episodes[0], episodes), episodes[1]);
  assert.equal(findNextEpisodeInSeason(episodes[2], episodes), null);
});

test('findNextSeason returns the next available season', () => {
  const seasons = [{ season_number: 1 }, { season_number: 3 }, { season_number: 2 }];
  assert.deepEqual(findNextSeason(1, seasons), { season_number: 2 });
  assert.equal(findNextSeason(3, seasons), null);
});

test('shouldPrepareNextEpisode triggers only near the end once', () => {
  assert.equal(shouldPrepareNextEpisode(100, 100 + AUTOPLAY_PRELOAD_SECONDS - 1, false, true), true);
  assert.equal(shouldPrepareNextEpisode(10, 100, false, true), false);
  assert.equal(shouldPrepareNextEpisode(100, 105, true, true), false);
  assert.equal(shouldPrepareNextEpisode(100, 105, false, false), false);
});
