export type TelegramDialogCategory = 'all' | 'groups' | 'channels';
export type TelegramDialogKind = 'group' | 'channel';
export type TelegramDialogMediaType = 'telegram_group' | 'telegram_channel';

export const TELEGRAM_DIALOG_CATEGORIES: TelegramDialogCategory[] = ['all', 'groups', 'channels'];

export const isTelegramDialogMediaType = (value: unknown): value is TelegramDialogMediaType =>
  value === 'telegram_group' || value === 'telegram_channel';

export const getTelegramDialogMediaType = (kind: TelegramDialogKind): TelegramDialogMediaType =>
  kind === 'channel' ? 'telegram_channel' : 'telegram_group';

export const getTelegramDialogKindFromMediaType = (
  value: unknown
): TelegramDialogKind | null => {
  if (value === 'telegram_channel') return 'channel';
  if (value === 'telegram_group') return 'group';
  return null;
};

export const matchesTelegramDialogCategory = (
  mediaType: unknown,
  category: TelegramDialogCategory
) => {
  if (category === 'all') return isTelegramDialogMediaType(mediaType);
  if (category === 'groups') return mediaType === 'telegram_group';
  if (category === 'channels') return mediaType === 'telegram_channel';
  return false;
};

export const filterTelegramDialogItems = <T extends { mediaType?: unknown }>(
  items: T[],
  category: TelegramDialogCategory
) => {
  if (category === 'all') {
    return items.filter((item) => isTelegramDialogMediaType(item.mediaType));
  }
  return items.filter((item) => matchesTelegramDialogCategory(item.mediaType, category));
};

const buildInitials = (title: string) => {
  const tokens = String(title || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const initials = tokens.slice(0, 2).map((token) => token[0]).join('').toUpperCase();
  return initials || 'TG';
};

export const buildTelegramDialogPoster = ({
  title,
  kind
}: {
  title: string;
  kind: TelegramDialogKind;
}) => {
  const initials = buildInitials(title);
  const accentStart = kind === 'channel' ? '#5B7CFA' : '#00C6FF';
  const accentEnd = kind === 'channel' ? '#8E5CFF' : '#00F0B5';
  const badge = kind === 'channel' ? 'CHANNEL' : 'GROUP';
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="500" height="750" viewBox="0 0 500 750" fill="none">
      <defs>
        <linearGradient id="bg" x1="42" y1="36" x2="458" y2="714" gradientUnits="userSpaceOnUse">
          <stop stop-color="#0F172A"/>
          <stop offset="0.56" stop-color="#111827"/>
          <stop offset="1" stop-color="#020617"/>
        </linearGradient>
        <linearGradient id="accent" x1="86" y1="108" x2="412" y2="642" gradientUnits="userSpaceOnUse">
          <stop stop-color="${accentStart}"/>
          <stop offset="1" stop-color="${accentEnd}"/>
        </linearGradient>
      </defs>
      <rect width="500" height="750" rx="36" fill="url(#bg)"/>
      <rect x="34" y="34" width="432" height="682" rx="30" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.08)"/>
      <rect x="76" y="94" width="348" height="476" rx="34" fill="url(#accent)" opacity="0.22"/>
      <rect x="76" y="94" width="348" height="476" rx="34" stroke="rgba(125,235,214,0.24)"/>
      <circle cx="250" cy="262" r="96" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.12)"/>
      <text x="250" y="292" fill="#F8FAFC" font-family="Arial, Helvetica, sans-serif" font-size="92" font-weight="700" text-anchor="middle">${initials}</text>
      <text x="76" y="620" fill="#7DEBD6" font-family="Arial, Helvetica, sans-serif" font-size="24" letter-spacing="6">${badge}</text>
      <text x="76" y="668" fill="#F8FAFC" font-family="Arial, Helvetica, sans-serif" font-size="36" font-weight="700">${String(title || '').slice(0, 22)}</text>
      <text x="76" y="706" fill="rgba(248,250,252,0.62)" font-family="Arial, Helvetica, sans-serif" font-size="20">Telegram corridor</text>
    </svg>
  `;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
};

export const buildTelegramDialogDescription = ({
  kind,
  username,
  unreadCount,
  memberCount
}: {
  kind: TelegramDialogKind;
  username?: string;
  unreadCount?: number;
  memberCount?: number;
}) => {
  const parts = [
    kind === 'channel' ? 'ערוץ טלגרם' : 'קבוצת טלגרם',
    username ? `@${username}` : null,
    memberCount ? `${memberCount.toLocaleString('en-US')} חברים` : null,
    unreadCount ? `${unreadCount.toLocaleString('en-US')} שלא נקראו` : null
  ].filter(Boolean);

  return parts.join(' • ');
};
