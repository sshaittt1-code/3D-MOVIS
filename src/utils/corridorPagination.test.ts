import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLoadMorePageKey,
  canTriggerLoadMoreForPage,
  isCurrentLoadMoreRequest,
  shouldAdvanceContentPage
} from './corridorPagination';

test('failed page-2 append can be retried after tracker reset', () => {
  const rootKey = 'movies|popular|all|all|default';
  const pageKey = buildLoadMorePageKey(rootKey, 2);

  assert.equal(canTriggerLoadMoreForPage(null, null, pageKey), true);
  assert.equal(canTriggerLoadMoreForPage(pageKey, pageKey, pageKey), false);
  assert.equal(canTriggerLoadMoreForPage(null, null, pageKey), true);
});

test('empty normalized page does not advance content page', () => {
  assert.equal(shouldAdvanceContentPage(0), false);
});

test('successful append advances content page', () => {
  assert.equal(shouldAdvanceContentPage(20), true);
});

test('route changes invalidate stale load more requests', () => {
  const oldRootKey = 'movies|popular|all|all|default';
  const newRootKey = 'series|popular|all|all|default';
  const pageKey = buildLoadMorePageKey(oldRootKey, 2);

  assert.equal(
    isCurrentLoadMoreRequest({
      activeRootRequestKey: newRootKey,
      requestRootRequestKey: oldRootKey,
      activeLoadMorePageKey: pageKey,
      requestPageKey: pageKey
    }),
    false
  );
});
