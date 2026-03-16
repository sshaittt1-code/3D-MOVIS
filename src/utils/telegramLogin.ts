import type { TelegramAuthStatus } from './telegramPlayer';

export const TELEGRAM_DEFAULT_COUNTRY_CODE = '+972';
export const TELEGRAM_DEFAULT_COUNTRY_DIGITS = '972';

const TELEGRAM_ERROR_TRANSLATIONS: Array<{ match: RegExp; message: string }> = [
  { match: /PHONE_NUMBER_INVALID/i, message: 'מספר הטלפון אינו תקין.' },
  { match: /PHONE_CODE_INVALID/i, message: 'קוד האימות שגוי.' },
  { match: /PHONE_CODE_EXPIRED/i, message: 'קוד האימות פג תוקף. שלח קוד חדש.' },
  { match: /PASSWORD_HASH_INVALID/i, message: 'סיסמת האבטחה שגויה.' },
  { match: /SESSION_PASSWORD_NEEDED/i, message: 'נדרשת סיסמת אבטחה של Telegram.' },
  { match: /FLOOD_WAIT/i, message: 'Telegram ביקש להמתין לפני ניסיון נוסף.' },
  { match: /API_ID_INVALID|API_HASH_INVALID/i, message: 'Telegram API לא מוגדר כראוי בשרת.' },
  { match: /Login session expired|session expired|not found/i, message: 'סשן ההתחברות פג. שלח קוד מחדש.' },
  { match: /Not waiting for code/i, message: 'השרת לא ממתין כרגע לקוד אימות. שלח קוד מחדש.' },
  { match: /Not waiting for password/i, message: 'השרת לא ממתין כרגע לסיסמת האבטחה. נסה להתחבר מחדש.' },
  { match: /not configured/i, message: 'Telegram API לא מוגדר בשרת.' }
];

export const normalizeIsraeliPhoneDigits = (value: string) => {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';

  const withoutCountryPrefix = digits.startsWith(TELEGRAM_DEFAULT_COUNTRY_DIGITS)
    ? digits.slice(TELEGRAM_DEFAULT_COUNTRY_DIGITS.length)
    : digits;

  return withoutCountryPrefix.replace(/^0+/, '');
};

export const buildIsraeliPhoneE164 = (value: string) => {
  const localDigits = normalizeIsraeliPhoneDigits(value);
  return localDigits ? `${TELEGRAM_DEFAULT_COUNTRY_CODE}${localDigits}` : '';
};

export const normalizeTelegramPhoneE164 = (value: string) => {
  const trimmed = String(value || '').trim();
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;
  if (trimmed.startsWith('+')) {
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  }
  if (/^[1-9]\d{7,14}$/.test(digits)) {
    return `+${digits}`;
  }
  return null;
};

export const isLikelyValidIsraeliPhoneDigits = (value: string) => {
  const localDigits = normalizeIsraeliPhoneDigits(value);
  return localDigits.length >= 8 && localDigits.length <= 10;
};

export const resolveTelegramStatusAfterRefresh = ({
  currentStatus,
  hasActiveLogin,
  remoteLoggedIn
}: {
  currentStatus: TelegramAuthStatus;
  hasActiveLogin: boolean;
  remoteLoggedIn: boolean;
}): TelegramAuthStatus => {
  if (remoteLoggedIn) return 'loggedIn';
  if (hasActiveLogin && (currentStatus === 'codeInput' || currentStatus === 'passwordInput')) {
    return currentStatus;
  }
  if (currentStatus === 'phoneInput') return 'phoneInput';
  return 'loggedOut';
};

export const translateTelegramAuthError = (message: string) => {
  const trimmed = String(message || '').trim();
  if (!trimmed) return 'אירעה שגיאה לא צפויה בהתחברות ל-Telegram.';

  for (const candidate of TELEGRAM_ERROR_TRANSLATIONS) {
    if (candidate.match.test(trimmed)) {
      return candidate.message;
    }
  }

  return trimmed;
};
