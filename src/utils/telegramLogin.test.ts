import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildIsraeliPhoneE164,
  isLikelyValidIsraeliPhoneDigits,
  normalizeTelegramPhoneE164,
  normalizeIsraeliPhoneDigits,
  resolveTelegramStatusAfterRefresh,
  translateTelegramAuthError
} from './telegramLogin';

test('normalizeIsraeliPhoneDigits keeps only local digits without duplicated country code', () => {
  assert.equal(normalizeIsraeliPhoneDigits('0501234567'), '501234567');
  assert.equal(normalizeIsraeliPhoneDigits('501234567'), '501234567');
  assert.equal(normalizeIsraeliPhoneDigits('+972501234567'), '501234567');
  assert.equal(normalizeIsraeliPhoneDigits('972501234567'), '501234567');
  assert.equal(normalizeIsraeliPhoneDigits('(050) 123-45-67'), '501234567');
});

test('buildIsraeliPhoneE164 produces a full +972 number', () => {
  assert.equal(buildIsraeliPhoneE164('0501234567'), '+972501234567');
  assert.equal(buildIsraeliPhoneE164('501234567'), '+972501234567');
  assert.equal(buildIsraeliPhoneE164('+972501234567'), '+972501234567');
  assert.equal(buildIsraeliPhoneE164('972501234567'), '+972501234567');
});

test('normalizeTelegramPhoneE164 only accepts complete international numbers', () => {
  assert.equal(normalizeTelegramPhoneE164('+972501234567'), '+972501234567');
  assert.equal(normalizeTelegramPhoneE164('972501234567'), '+972501234567');
  assert.equal(normalizeTelegramPhoneE164('0501234567'), null);
});

test('isLikelyValidIsraeliPhoneDigits accepts common Israeli local lengths', () => {
  assert.equal(isLikelyValidIsraeliPhoneDigits('0501234567'), true);
  assert.equal(isLikelyValidIsraeliPhoneDigits('1234'), false);
});

test('resolveTelegramStatusAfterRefresh preserves active code/password flows', () => {
  assert.equal(
    resolveTelegramStatusAfterRefresh({
      currentStatus: 'codeInput',
      hasActiveLogin: true,
      remoteLoggedIn: false
    }),
    'codeInput'
  );
  assert.equal(
    resolveTelegramStatusAfterRefresh({
      currentStatus: 'passwordInput',
      hasActiveLogin: true,
      remoteLoggedIn: false
    }),
    'passwordInput'
  );
  assert.equal(
    resolveTelegramStatusAfterRefresh({
      currentStatus: 'loggedOut',
      hasActiveLogin: false,
      remoteLoggedIn: true
    }),
    'loggedIn'
  );
  assert.equal(
    resolveTelegramStatusAfterRefresh({
      currentStatus: 'phoneInput',
      hasActiveLogin: false,
      remoteLoggedIn: false
    }),
    'phoneInput'
  );
});

test('translateTelegramAuthError maps Telegram auth failures to clear Hebrew copy', () => {
  assert.equal(translateTelegramAuthError('PHONE_NUMBER_INVALID'), 'מספר הטלפון אינו תקין.');
  assert.equal(translateTelegramAuthError('PHONE_CODE_INVALID'), 'קוד האימות שגוי.');
  assert.equal(translateTelegramAuthError('PASSWORD_HASH_INVALID'), 'סיסמת האבטחה שגויה.');
  assert.equal(translateTelegramAuthError('Something else'), 'Something else');
});
