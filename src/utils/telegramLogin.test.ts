import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildIsraeliPhoneE164,
  isLikelyValidIsraeliPhoneDigits,
  mapTelegramServerStageToPendingStage,
  mapTelegramServerStageToStatus,
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

test('resolveTelegramStatusAfterRefresh preserves active login steps', () => {
  assert.equal(
    resolveTelegramStatusAfterRefresh({
      currentStatus: 'codeInput',
      hasActiveLogin: true,
      remoteLoggedIn: false,
      pendingStage: 'awaiting_code'
    }),
    'codeInput'
  );
  assert.equal(
    resolveTelegramStatusAfterRefresh({
      currentStatus: 'passwordInput',
      hasActiveLogin: true,
      remoteLoggedIn: false,
      pendingStage: 'awaiting_password'
    }),
    'passwordInput'
  );
  assert.equal(
    resolveTelegramStatusAfterRefresh({
      currentStatus: 'phoneInput',
      hasActiveLogin: true,
      remoteLoggedIn: false,
      pendingStage: 'starting'
    }),
    'phoneInput'
  );
  assert.equal(
    resolveTelegramStatusAfterRefresh({
      currentStatus: 'loggedOut',
      hasActiveLogin: false,
      remoteLoggedIn: true,
      pendingStage: 'idle'
    }),
    'loggedIn'
  );
  assert.equal(
    resolveTelegramStatusAfterRefresh({
      currentStatus: 'phoneInput',
      hasActiveLogin: false,
      remoteLoggedIn: false,
      pendingStage: 'idle'
    }),
    'phoneInput'
  );
});

test('telegram login stage helpers map server stages predictably', () => {
  assert.equal(mapTelegramServerStageToStatus('starting'), 'phoneInput');
  assert.equal(mapTelegramServerStageToStatus('codeInput'), 'codeInput');
  assert.equal(mapTelegramServerStageToStatus('passwordInput'), 'passwordInput');
  assert.equal(mapTelegramServerStageToStatus('loggedIn'), 'loggedIn');

  assert.equal(mapTelegramServerStageToPendingStage('starting'), 'starting');
  assert.equal(mapTelegramServerStageToPendingStage('codeInput'), 'awaiting_code');
  assert.equal(mapTelegramServerStageToPendingStage('passwordInput'), 'awaiting_password');
  assert.equal(mapTelegramServerStageToPendingStage('loggedIn'), 'idle');
});

test('translateTelegramAuthError maps Telegram auth failures to clear copy', () => {
  assert.match(translateTelegramAuthError('PHONE_NUMBER_INVALID'), /תקין/);
  assert.match(translateTelegramAuthError('PHONE_CODE_INVALID'), /קוד/);
  assert.match(translateTelegramAuthError('PASSWORD_HASH_INVALID'), /סיסמ/);
  assert.equal(translateTelegramAuthError('Request timed out'), 'שליחת הקוד לוקחת יותר מדי זמן. נסה שוב.');
  assert.equal(translateTelegramAuthError('Something else'), 'Something else');
});
