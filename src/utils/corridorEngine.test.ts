import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPosterLayout,
  decorateCorridorItems,
  getCorridorCurrentIndex,
  getCorridorRenderAheadCount,
  getLastPosterZ,
  getNearEndTriggerZ,
  getRenderedPosterLayout
} from './corridorEngine';

test('decorateCorridorItems creates stable scoped ids without index-only keys', () => {
  const items = decorateCorridorItems([
    { id: 10, mediaType: 'movie', title: 'Inception' },
    { id: 20, mediaType: 'movie', title: 'Interstellar' }
  ], 'movies|popular');

  assert.equal(items[0].uniqueId, 'movies|popular:movie:10:::');
  assert.equal(items[1].uniqueId, 'movies|popular:movie:20:::');
});

test('buildPosterLayout alternates left and right walls', () => {
  const layout = buildPosterLayout(decorateCorridorItems([
    { id: 1, mediaType: 'movie', title: 'A' },
    { id: 2, mediaType: 'movie', title: 'B' },
    { id: 3, mediaType: 'movie', title: 'C' }
  ], 'scope'));

  assert.equal(layout[0].position[0] < 0, true);
  assert.equal(layout[1].position[0] > 0, true);
  assert.equal(layout[0].position[2], layout[1].position[2]);
  assert.equal(layout[2].position[2] < layout[0].position[2], true);
});

test('rendered poster layout follows the camera and stays bounded', () => {
  const items = decorateCorridorItems(Array.from({ length: 40 }, (_, index) => ({
    id: index + 1,
    mediaType: 'movie',
    title: `Movie ${index + 1}`
  })), 'scope');
  const layout = buildPosterLayout(items);

  const firstWindow = getRenderedPosterLayout(layout, 2, getCorridorRenderAheadCount(20));
  const deeperWindow = getRenderedPosterLayout(layout, -18, getCorridorRenderAheadCount(20));

  assert.equal(firstWindow.length > 0, true);
  assert.equal(deeperWindow[0].movie.id !== firstWindow[0].movie.id, true);
  assert.equal(deeperWindow.length <= getCorridorRenderAheadCount(20) + 6, true);
});

test('current index and near-end trigger use corridor spacing rules', () => {
  assert.equal(getCorridorCurrentIndex(2), 0);
  assert.equal(getCorridorCurrentIndex(-3), 2);
  assert.equal(getNearEndTriggerZ(-47), -34.75);
});

test('last poster z reflects the deepest visible poster wall', () => {
  const layout = buildPosterLayout(decorateCorridorItems([
    { id: 1, mediaType: 'movie', title: 'A' },
    { id: 2, mediaType: 'movie', title: 'B' },
    { id: 3, mediaType: 'movie', title: 'C' },
    { id: 4, mediaType: 'movie', title: 'D' }
  ], 'scope'));

  assert.equal(getLastPosterZ(layout), -7);
});
