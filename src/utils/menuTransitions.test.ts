import test from 'node:test';
import assert from 'node:assert/strict';
import type { SideMenuItem } from './menuConfig';
import { resolveMenuSelectionAction } from './menuTransitions';

const telegramItem: SideMenuItem = {
  id: 'telegram-all',
  label: 'טלגרם',
  description: 'בדיקה',
  icon: 'T',
  kind: 'route',
  route: { target: 'telegram', category: 'all' }
};

test('telegram route opens auth wizard when the account is not connected', () => {
  assert.deepEqual(resolveMenuSelectionAction(telegramItem, { telegramConnected: false }), {
    type: 'open-telegram-auth',
    returnToSidebar: true
  });
});

test('telegram route enters the corridor directly after login', () => {
  assert.deepEqual(resolveMenuSelectionAction(telegramItem, { telegramConnected: true }), {
    type: 'apply-route'
  });
});

test('settings item opens the requested settings panel instead of routing', () => {
  const settingsItem: SideMenuItem = {
    id: 'settings-general',
    label: 'הגדרות',
    description: 'בדיקה',
    icon: 'S',
    kind: 'settings',
    panel: 'general'
  };

  assert.deepEqual(resolveMenuSelectionAction(settingsItem, { telegramConnected: true }), {
    type: 'open-settings',
    panel: 'general',
    returnToSidebar: true
  });
});

test('search route opens the search overlay directly', () => {
  const searchItem: SideMenuItem = {
    id: 'quick-search',
    label: 'חיפוש',
    description: 'בדיקה',
    icon: 'Q',
    kind: 'route',
    route: { target: 'search' }
  };

  assert.deepEqual(resolveMenuSelectionAction(searchItem, { telegramConnected: true }), {
    type: 'open-search'
  });
});
