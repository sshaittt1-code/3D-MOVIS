export type RuntimePerformanceTier = 'low' | 'balanced' | 'high';

export type RuntimePerformanceHints = {
  hardwareConcurrency?: number | null;
  deviceMemory?: number | null;
  saveData?: boolean | null;
};

export type RuntimePerformanceProfile = {
  tier: RuntimePerformanceTier;
  texturePrefetchConcurrency: number;
  priorityPosterCount: number;
  secondaryPosterCount: number;
  backgroundWarmupDelayMs: number;
  backgroundWarmupTargets: number;
  allowCrossCategoryWarmup: boolean;
  allowSecondaryPosterPrefetch: boolean;
  prefetchPostersForNextPage: boolean;
};

const LOW_PROFILE: RuntimePerformanceProfile = {
  tier: 'low',
  texturePrefetchConcurrency: 2,
  priorityPosterCount: 6,
  secondaryPosterCount: 0,
  backgroundWarmupDelayMs: 2200,
  backgroundWarmupTargets: 0,
  allowCrossCategoryWarmup: false,
  allowSecondaryPosterPrefetch: false,
  prefetchPostersForNextPage: false
};

const BALANCED_PROFILE: RuntimePerformanceProfile = {
  tier: 'balanced',
  texturePrefetchConcurrency: 4,
  priorityPosterCount: 8,
  secondaryPosterCount: 6,
  backgroundWarmupDelayMs: 1400,
  backgroundWarmupTargets: 1,
  allowCrossCategoryWarmup: true,
  allowSecondaryPosterPrefetch: true,
  prefetchPostersForNextPage: true
};

const HIGH_PROFILE: RuntimePerformanceProfile = {
  tier: 'high',
  texturePrefetchConcurrency: 6,
  priorityPosterCount: 12,
  secondaryPosterCount: 12,
  backgroundWarmupDelayMs: 800,
  backgroundWarmupTargets: 2,
  allowCrossCategoryWarmup: true,
  allowSecondaryPosterPrefetch: true,
  prefetchPostersForNextPage: true
};

const normalizePositiveNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

export const resolveRuntimePerformanceProfile = (
  hints: RuntimePerformanceHints = {}
): RuntimePerformanceProfile => {
  const hardwareConcurrency = normalizePositiveNumber(
    hints.hardwareConcurrency ?? (typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : null)
  );
  const deviceMemory = normalizePositiveNumber(
    hints.deviceMemory ?? (typeof navigator !== 'undefined' ? (navigator as any).deviceMemory : null)
  );
  const saveData = Boolean(
    hints.saveData ?? (typeof navigator !== 'undefined' ? (navigator as any).connection?.saveData : false)
  );

  if (
    saveData
    || (deviceMemory !== null && deviceMemory <= 2)
    || (hardwareConcurrency !== null && hardwareConcurrency <= 4)
  ) {
    return LOW_PROFILE;
  }

  if (
    (deviceMemory !== null && deviceMemory <= 4)
    || (hardwareConcurrency !== null && hardwareConcurrency <= 8)
  ) {
    return BALANCED_PROFILE;
  }

  return HIGH_PROFILE;
};

export const shouldRunBackgroundWarmup = (
  profile: RuntimePerformanceProfile,
  appVisible: boolean
) => appVisible && profile.allowCrossCategoryWarmup && profile.backgroundWarmupTargets > 0;
