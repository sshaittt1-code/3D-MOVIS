import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hasAvailableUpdate,
  isCurrentVersionSupported,
  normalizeUpdateManifest,
  resolveUpdatePhase
} from './updateManager';

test('normalizeUpdateManifest resolves relative apk URLs against the API base', () => {
  const manifest = normalizeUpdateManifest({
    version: '1.1.0',
    versionCode: 2,
    publishedAt: '2026-03-16T10:00:00+02:00',
    apkUrl: '/apk/latest.apk',
    notes: ['OTA ready'],
    mandatory: false,
    minSupportedVersion: '1.0.0',
    apkAvailable: true,
    packageId: 'com.holocinema.tv'
  }, 'https://updates.example.com');

  assert.ok(manifest);
  assert.equal(manifest?.apkUrl, 'https://updates.example.com/apk/latest.apk');
  assert.equal(manifest?.versionCode, 2);
  assert.equal(manifest?.packageId, 'com.holocinema.tv');
});

test('update availability and support rules stay consistent', () => {
  const manifest = normalizeUpdateManifest({
    version: '1.1.0',
    versionCode: 2,
    publishedAt: '2026-03-16T10:00:00+02:00',
    apkUrl: 'https://updates.example.com/apk/latest.apk',
    notes: [],
    mandatory: false,
    minSupportedVersion: '1.0.0',
    apkAvailable: true
  }, 'https://updates.example.com');

  assert.ok(manifest);
  assert.equal(hasAvailableUpdate('1.0.0', manifest), true);
  assert.equal(hasAvailableUpdate('1.1.0', manifest), false);
  assert.equal(isCurrentVersionSupported('1.0.0', manifest!), true);
  assert.equal(isCurrentVersionSupported('0.9.0', manifest!), false);
  assert.equal(resolveUpdatePhase('1.0.0', manifest), 'available');
  assert.equal(resolveUpdatePhase('1.1.0', manifest), 'up_to_date');
});

test('resolveUpdatePhase stays idle when the backend has no APK ready', () => {
  const manifest = normalizeUpdateManifest({
    version: '1.2.0',
    versionCode: 3,
    publishedAt: '2026-03-16T10:00:00+02:00',
    apkUrl: 'https://updates.example.com/apk/latest.apk',
    notes: [],
    mandatory: false,
    minSupportedVersion: '1.0.0',
    apkAvailable: false
  }, 'https://updates.example.com');

  assert.ok(manifest);
  assert.equal(resolveUpdatePhase('1.0.0', manifest), 'idle');
});
