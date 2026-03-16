import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTelegramDialogDescription,
  buildTelegramDialogPoster,
  filterTelegramDialogItems,
  getTelegramDialogKindFromMediaType,
  getTelegramDialogMediaType,
  isTelegramDialogMediaType
} from './telegramDialogs';

test('telegram dialog media types convert between kind and mediaType', () => {
  assert.equal(getTelegramDialogMediaType('group'), 'telegram_group');
  assert.equal(getTelegramDialogMediaType('channel'), 'telegram_channel');
  assert.equal(getTelegramDialogKindFromMediaType('telegram_group'), 'group');
  assert.equal(getTelegramDialogKindFromMediaType('telegram_channel'), 'channel');
  assert.equal(isTelegramDialogMediaType('telegram_channel'), true);
  assert.equal(isTelegramDialogMediaType('movie'), false);
});

test('telegram dialog filtering isolates groups and channels', () => {
  const items = [
    { id: 'a', mediaType: 'telegram_group' },
    { id: 'b', mediaType: 'telegram_channel' },
    { id: 'c', mediaType: 'movie' }
  ];

  assert.deepEqual(filterTelegramDialogItems(items, 'all').map((item) => item.id), ['a', 'b']);
  assert.deepEqual(filterTelegramDialogItems(items, 'groups').map((item) => item.id), ['a']);
  assert.deepEqual(filterTelegramDialogItems(items, 'channels').map((item) => item.id), ['b']);
});

test('telegram dialog poster helper returns a data url and description text', () => {
  const poster = buildTelegramDialogPoster({ title: 'Cinema Club', kind: 'group' });
  const description = buildTelegramDialogDescription({
    kind: 'group',
    username: 'cinema_club',
    unreadCount: 7
  });

  assert.ok(poster.startsWith('data:image/svg+xml'));
  assert.match(description, /טלגרם/);
  assert.match(description, /@cinema_club/);
});
