import test from 'node:test';
import assert from 'node:assert/strict';
import { compareVersions, isRemoteVersionNewer } from './version';

test('compareVersions handles equality and ordering', () => {
  assert.equal(compareVersions('1.0.6', '1.0.6'), 0);
  assert.equal(compareVersions('1.0.7', '1.0.6'), 1);
  assert.equal(compareVersions('1.0.6', '1.0.7'), -1);
  assert.equal(compareVersions('1.0.10', '1.0.6'), 1);
});

test('isRemoteVersionNewer rejects downgrades and malformed versions', () => {
  assert.equal(isRemoteVersionNewer('1.0.6', '1.0.5'), false);
  assert.equal(isRemoteVersionNewer('1.0.6', '1.0.6'), false);
  assert.equal(isRemoteVersionNewer('1.0.6', '1.1.0'), true);
  assert.equal(isRemoteVersionNewer('1.0.6', 'latest'), false);
});
