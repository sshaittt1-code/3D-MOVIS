import type { SideMenuItem, SettingsPanel } from './menuConfig';

export type MenuSelectionAction =
  | { type: 'apply-route' }
  | { type: 'open-search' }
  | { type: 'open-settings'; panel: SettingsPanel; returnToSidebar: boolean }
  | { type: 'open-telegram-auth'; returnToSidebar: boolean }
  | { type: 'exit' };

export const resolveMenuSelectionAction = (
  item: SideMenuItem,
  options: { telegramConnected: boolean }
): MenuSelectionAction => {
  if (item.kind === 'settings') {
    return {
      type: 'open-settings',
      panel: item.panel,
      returnToSidebar: true
    };
  }

  if (item.kind === 'action') {
    return { type: 'exit' };
  }

  if (item.route.target === 'search') {
    return { type: 'open-search' };
  }

  if (item.route.target === 'telegram' && !options.telegramConnected) {
    return {
      type: 'open-telegram-auth',
      returnToSidebar: true
    };
  }

  return { type: 'apply-route' };
};
