import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPosterLayout,
  decorateCorridorItems,
  type CorridorRenderableItem
} from './corridorEngine';
import {
  buildPosterSlotWindow,
  getCorridorTierConfig,
  getShellPairIndices,
  resolvePosterTextureIntents
} from './corridorScene';

const buildItems = (count: number) => Array.from({ length: count }, (_, index) => ({
  id: index + 1,
  title: `Item ${index + 1}`,
  poster: `https://example.com/poster-${index + 1}.jpg`,
  mediaType: 'movie'
})) as Array<CorridorRenderableItem & { poster: string }>;

test('corridor tier config exposes fixed slot budgets per runtime tier', () => {
  assert.equal(getCorridorTierConfig('low').visiblePosterSlots, 20);
  assert.equal(getCorridorTierConfig('balanced').visiblePosterSlots, 24);
  assert.equal(getCorridorTierConfig('high').visiblePosterSlots, 30);
});

test('poster slot window recycles stable slot ids while advancing through the corridor', () => {
  const layout = buildPosterLayout(decorateCorridorItems(buildItems(40), 'movies'));
  const lowTier = getCorridorTierConfig('low');

  const firstWindow = buildPosterSlotWindow(layout, 2, lowTier);
  const advancedWindow = buildPosterSlotWindow(layout, -20, lowTier);

  assert.deepEqual(
    firstWindow.map((slot) => slot.slotId),
    advancedWindow.map((slot) => slot.slotId)
  );
  assert.notEqual(firstWindow[0]?.uniqueId, advancedWindow[0]?.uniqueId);
});

test('texture intent promotes the focused poster, neighbors, and a limited look-ahead budget', () => {
  const layout = buildPosterLayout(decorateCorridorItems(buildItems(32), 'movies'));
  const tier = getCorridorTierConfig('high');
  const slots = buildPosterSlotWindow(layout, 2, tier);
  const focused = slots[8]?.uniqueId ?? null;
  const intents = resolvePosterTextureIntents(slots, focused, tier);

  assert.equal(intents.get('slot:8'), 'full');
  assert.equal(intents.get('slot:7'), 'full');
  assert.equal(intents.get('slot:9'), 'full');
  assert.equal(intents.get('slot:12'), 'full');
  assert.equal(intents.get('slot:0'), 'thumb');
});

test('shell pair indices follow the camera without shrinking the section count', () => {
  const tier = getCorridorTierConfig('balanced');
  const pairIndices = getShellPairIndices(-28, tier);

  assert.equal(pairIndices.length, tier.shellSectionPairs);
  assert.ok(pairIndices[0] >= 0);
  assert.ok(pairIndices[pairIndices.length - 1] > pairIndices[0]);
});
