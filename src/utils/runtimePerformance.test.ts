import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveRuntimePerformanceProfile,
  shouldRunBackgroundWarmup
} from './runtimePerformance';

test('runtime profile prefers low tier for constrained devices or save-data', () => {
  assert.equal(resolveRuntimePerformanceProfile({ hardwareConcurrency: 4, deviceMemory: 2 }).tier, 'low');
  assert.equal(resolveRuntimePerformanceProfile({ hardwareConcurrency: 12, deviceMemory: 8, saveData: true }).tier, 'low');
});

test('runtime profile prefers balanced tier for mid-range devices', () => {
  const profile = resolveRuntimePerformanceProfile({ hardwareConcurrency: 6, deviceMemory: 4 });
  assert.equal(profile.tier, 'balanced');
  assert.equal(profile.texturePrefetchConcurrency, 4);
});

test('runtime profile prefers high tier for capable devices', () => {
  const profile = resolveRuntimePerformanceProfile({ hardwareConcurrency: 12, deviceMemory: 8 });
  assert.equal(profile.tier, 'high');
  assert.equal(profile.backgroundWarmupTargets, 2);
});

test('background warmup only runs when visible and enabled', () => {
  const low = resolveRuntimePerformanceProfile({ hardwareConcurrency: 2, deviceMemory: 1 });
  const high = resolveRuntimePerformanceProfile({ hardwareConcurrency: 12, deviceMemory: 8 });

  assert.equal(shouldRunBackgroundWarmup(low, true), false);
  assert.equal(shouldRunBackgroundWarmup(high, false), false);
  assert.equal(shouldRunBackgroundWarmup(high, true), true);
});
