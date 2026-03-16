import {
  CORRIDOR_INITIAL_CAMERA_Z,
  CORRIDOR_POSTER_PAIR_SPACING,
  CORRIDOR_POSTER_X_OFFSET,
  getCorridorCurrentIndex,
  getPosterTransformForIndex,
  type CorridorLayoutEntry,
  type CorridorRenderItem,
  type CorridorRenderableItem
} from './corridorEngine';
import type { RuntimePerformanceTier } from './runtimePerformance';

export type PosterTextureState = 'empty' | 'thumb' | 'full' | 'failed';
export type PosterTextureIntent = 'thumb' | 'full';

export type CorridorTierConfig = {
  tier: RuntimePerformanceTier;
  visiblePosterSlots: number;
  behindPosterSlots: number;
  fullQualityRadius: number;
  aheadFullQualityCount: number;
  maxThumbPrefetch: number;
  maxFullUpgrades: number;
  shellSectionPairs: number;
  fogNear: number;
  fogFar: number;
  railSway: number;
  railLift: number;
};

export type CorridorShellConfig = {
  width: number;
  wallHeight: number;
  ceilingY: number;
  sideWallX: number;
  floorInset: number;
  runnerWidth: number;
  bayWidth: number;
  bayHeight: number;
  bayDepth: number;
  bayInset: number;
  lightStripWidth: number;
  palette: {
    background: string;
    floor: string;
    floorRunner: string;
    wall: string;
    ceiling: string;
    frame: string;
    accent: string;
    accentSoft: string;
    bayBack: string;
    haze: string;
  };
};

export type PosterSlot<T extends CorridorRenderableItem = CorridorRenderableItem> = {
  slotId: string;
  item: CorridorRenderItem<T> | null;
  uniqueId: string | null;
  layoutIndex: number;
  pairIndex: number;
  wallSide: 'left' | 'right';
  position: [number, number, number];
  rotation: [number, number, number];
};

const LOW_TIER_CONFIG: CorridorTierConfig = {
  tier: 'low',
  visiblePosterSlots: 20,
  behindPosterSlots: 4,
  fullQualityRadius: 1,
  aheadFullQualityCount: 1,
  maxThumbPrefetch: 10,
  maxFullUpgrades: 3,
  shellSectionPairs: 12,
  fogNear: 14,
  fogFar: 58,
  railSway: 0.3,
  railLift: 0.08
};

const BALANCED_TIER_CONFIG: CorridorTierConfig = {
  tier: 'balanced',
  visiblePosterSlots: 24,
  behindPosterSlots: 4,
  fullQualityRadius: 2,
  aheadFullQualityCount: 2,
  maxThumbPrefetch: 14,
  maxFullUpgrades: 5,
  shellSectionPairs: 14,
  fogNear: 18,
  fogFar: 72,
  railSway: 0.38,
  railLift: 0.12
};

const HIGH_TIER_CONFIG: CorridorTierConfig = {
  tier: 'high',
  visiblePosterSlots: 30,
  behindPosterSlots: 4,
  fullQualityRadius: 2,
  aheadFullQualityCount: 4,
  maxThumbPrefetch: 18,
  maxFullUpgrades: 7,
  shellSectionPairs: 16,
  fogNear: 22,
  fogFar: 88,
  railSway: 0.46,
  railLift: 0.16
};

export const IMAX_CORRIDOR_SHELL_CONFIG: CorridorShellConfig = {
  width: 14.5,
  wallHeight: 7.4,
  ceilingY: 7.2,
  sideWallX: 6.45,
  floorInset: 0.02,
  runnerWidth: 3.7,
  bayWidth: 3.05,
  bayHeight: 4.35,
  bayDepth: 0.12,
  bayInset: CORRIDOR_POSTER_X_OFFSET + 0.22,
  lightStripWidth: 0.13,
  palette: {
    background: '#010407',
    floor: '#091217',
    floorRunner: '#0d1f29',
    wall: '#0b131a',
    ceiling: '#070d12',
    frame: '#17232d',
    accent: '#77e7ff',
    accentSoft: 'rgba(119, 231, 255, 0.24)',
    bayBack: '#060b0f',
    haze: '#02080c'
  }
};

export const getCorridorTierConfig = (tier: RuntimePerformanceTier): CorridorTierConfig => {
  if (tier === 'low') return LOW_TIER_CONFIG;
  if (tier === 'high') return HIGH_TIER_CONFIG;
  return BALANCED_TIER_CONFIG;
};

export const buildPosterSlotWindow = <T extends CorridorRenderableItem>(
  layout: Array<CorridorLayoutEntry<T>>,
  cameraZ: number,
  config: CorridorTierConfig
): Array<PosterSlot<T>> => {
  const currentIndex = getCorridorCurrentIndex(cameraZ);
  const startIndex = Math.max(0, currentIndex - config.behindPosterSlots);

  return Array.from({ length: config.visiblePosterSlots }, (_, slotIndex) => {
    const layoutIndex = startIndex + slotIndex;
    const entry = layout[layoutIndex] ?? null;
    const transform = entry ? entry : getPosterTransformForIndex(layoutIndex);
    return {
      slotId: `slot:${slotIndex}`,
      item: entry?.movie ?? null,
      uniqueId: entry?.movie?.uniqueId ?? null,
      layoutIndex,
      pairIndex: Math.floor(layoutIndex / 2),
      wallSide: layoutIndex % 2 === 0 ? 'left' : 'right',
      position: transform.position,
      rotation: transform.rotation
    };
  });
};

export const resolvePosterTextureIntents = <T extends CorridorRenderableItem>(
  slots: Array<PosterSlot<T>>,
  focusedUniqueId: string | null,
  config: CorridorTierConfig
) => {
  const intents = new Map<string, PosterTextureIntent>();
  slots.forEach((slot) => intents.set(slot.slotId, 'thumb'));

  if (!focusedUniqueId) {
    return intents;
  }

  const focusedSlot = slots.find((slot) => slot.uniqueId === focusedUniqueId);
  if (!focusedSlot) {
    return intents;
  }

  const consumeFullBudget = (slot: PosterSlot<T> | undefined | null, remainingBudget: number) => {
    if (!slot?.item || remainingBudget <= 0) return remainingBudget;
    intents.set(slot.slotId, 'full');
    return remainingBudget - 1;
  };

  let remainingBudget = config.maxFullUpgrades;
  remainingBudget = consumeFullBudget(focusedSlot, remainingBudget);

  for (let offset = 1; offset <= config.fullQualityRadius && remainingBudget > 0; offset += 1) {
    remainingBudget = consumeFullBudget(
      slots.find((slot) => slot.layoutIndex === focusedSlot.layoutIndex - offset),
      remainingBudget
    );
    remainingBudget = consumeFullBudget(
      slots.find((slot) => slot.layoutIndex === focusedSlot.layoutIndex + offset),
      remainingBudget
    );
  }

  for (let offset = config.fullQualityRadius + 1; offset <= config.fullQualityRadius + config.aheadFullQualityCount && remainingBudget > 0; offset += 1) {
    remainingBudget = consumeFullBudget(
      slots.find((slot) => slot.layoutIndex === focusedSlot.layoutIndex + offset),
      remainingBudget
    );
  }

  return intents;
};

export const getShellPairIndices = (
  cameraZ: number,
  config: CorridorTierConfig
) => {
  const currentPairIndex = Math.floor(getCorridorCurrentIndex(cameraZ) / 2);
  const behindPairCount = Math.max(2, Math.floor(config.behindPosterSlots / 2));
  const startPairIndex = Math.max(0, currentPairIndex - behindPairCount);
  return Array.from({ length: config.shellSectionPairs }, (_, offset) => startPairIndex + offset);
};

export const getShellDepthRange = (pairIndices: number[]) => {
  const firstPairIndex = pairIndices[0] ?? 0;
  const lastPairIndex = pairIndices[pairIndices.length - 1] ?? firstPairIndex;
  const startZ = -firstPairIndex * CORRIDOR_POSTER_PAIR_SPACING - CORRIDOR_INITIAL_CAMERA_Z;
  const endZ = -lastPairIndex * CORRIDOR_POSTER_PAIR_SPACING - CORRIDOR_INITIAL_CAMERA_Z;
  return {
    startZ,
    endZ,
    centerZ: (startZ + endZ) / 2,
    depth: Math.abs(endZ - startZ) + CORRIDOR_POSTER_PAIR_SPACING
  };
};
