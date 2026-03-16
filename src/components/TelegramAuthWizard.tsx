import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, ShieldCheck, X } from 'lucide-react';
import type { TelegramAuthStatus } from '../utils/telegramPlayer';
import { TELEGRAM_DEFAULT_COUNTRY_CODE } from '../utils/telegramLogin';
import { isTvBackKey } from '../utils/tvNavigation';
import { getTvDirection, isTvSelectKey, stopTvEvent } from '../utils/tvRemote';

type TelegramAuthWizardProps = {
  configured: boolean;
  status: TelegramAuthStatus;
  busy: boolean;
  error: string | null;
  phoneDigits: string;
  phoneE164: string;
  canStartLogin: boolean;
  code: string;
  password: string;
  onPhoneChange: (value: string) => void;
  onCodeChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onStartLogin: () => void;
  onResendCode: () => void;
  onSubmitCode: () => void;
  onSubmitPassword: () => void;
  onClose: () => void;
};

const STEP_LABELS = {
  phone: 'נא להכניס טלפון',
  code: 'הכנס קוד אימות',
  password: 'הכנס קוד אימות דו שלבי'
} as const;

type WizardStep = keyof typeof STEP_LABELS;

const getWizardStep = (status: TelegramAuthStatus): WizardStep => {
  if (status === 'passwordInput') return 'password';
  if (status === 'codeInput') return 'code';
  return 'phone';
};

export const TelegramAuthWizard = ({
  configured,
  status,
  busy,
  error,
  phoneDigits,
  phoneE164,
  canStartLogin,
  code,
  password,
  onPhoneChange,
  onCodeChange,
  onPasswordChange,
  onStartLogin,
  onResendCode,
  onSubmitCode,
  onSubmitPassword,
  onClose
}: TelegramAuthWizardProps) => {
  const step = getWizardStep(status);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const fieldRefs = useRef<Array<HTMLElement | null>>([]);

  const focusIds = useMemo(() => {
    if (!configured) {
      return ['close'];
    }
    if (step === 'phone') {
      return ['phone', 'submit', 'close'];
    }
    if (step === 'code') {
      return ['code', 'submit', 'resend', 'close'];
    }
    return ['password', 'submit', 'close'];
  }, [configured, step]);

  useEffect(() => {
    setFocusedIndex(0);
  }, [step]);

  useEffect(() => {
    fieldRefs.current[focusedIndex]?.focus();
  }, [focusedIndex, focusIds]);

  const moveFocus = (direction: 1 | -1) => {
    setFocusedIndex((current) => {
      const next = Math.max(0, Math.min(focusIds.length - 1, current + direction));
      return next;
    });
  };

  const activateCurrent = () => {
    const currentId = focusIds[focusedIndex];
    if (currentId === 'submit') {
      if (step === 'phone') {
        onStartLogin();
      } else if (step === 'code') {
        onSubmitCode();
      } else {
        onSubmitPassword();
      }
      return;
    }

    if (currentId === 'resend') {
      onResendCode();
      return;
    }

    if (currentId === 'close') {
      onClose();
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    const direction = getTvDirection(event);

    if (direction === 'down' || direction === 'right') {
      stopTvEvent(event);
      moveFocus(1);
      return;
    }

    if (direction === 'up' || direction === 'left') {
      stopTvEvent(event);
      moveFocus(-1);
      return;
    }

    if (isTvBackKey(event)) {
      stopTvEvent(event);
      onClose();
      return;
    }

    if (isTvSelectKey(event)) {
      const currentId = focusIds[focusedIndex];
      if (currentId === 'phone' || currentId === 'code' || currentId === 'password') {
        return;
      }
      stopTvEvent(event);
      activateCurrent();
    }
  };

  const statusText = !configured
    ? 'החיבור לטלגרם לא מוגדר כרגע בשרת.'
    : step === 'phone'
      ? 'הזן את מספר הנייד שלך. הקידומת +972 כבר מוכנה.'
      : step === 'code'
        ? 'הקוד נשלח לטלגרם. הזן אותו כדי להמשיך.'
        : 'לחשבון שלך מופעל אימות דו שלבי. הזן את הסיסמה כדי לסיים.';

  return (
    <div className="hc-screen-overlay" data-tv-scope="ui">
      <div
        className="hc-panel hc-panel--compact p-8"
        data-tv-back-scope="local"
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-start justify-between gap-6">
          <div>
            <div className="hc-badge hc-badge--telegram">
              <ShieldCheck size={16} />
              <span>חיבור לטלגרם</span>
            </div>
            <h2 className="mt-4 text-4xl font-bold text-white">{STEP_LABELS[step]}</h2>
            <p className="hc-subtitle mt-3 max-w-2xl text-base">{statusText}</p>
          </div>
          <button
            ref={(node) => { fieldRefs.current[focusIds.indexOf('close')] = node; }}
            onFocus={() => setFocusedIndex(focusIds.indexOf('close'))}
            onClick={onClose}
            className="hc-close-button p-3"
            aria-label="סגור חיבור לטלגרם"
          >
            <X size={22} />
          </button>
        </div>

        {error && (
          <div className="mt-6 rounded-[24px] border border-red-400/20 bg-red-500/10 px-5 py-4 text-sm text-red-100">
            {error}
          </div>
        )}

        {!configured ? null : (
          <div className="hc-card mt-8 p-6">
            {step === 'phone' && (
              <>
                <label className="block text-sm text-white/55">מספר טלפון</label>
                <div className="mt-3 flex items-center gap-3">
                  <div className="hc-input w-auto min-w-[7rem] bg-white/[0.03] text-center text-lg text-white">
                    {TELEGRAM_DEFAULT_COUNTRY_CODE}
                  </div>
                  <input
                    ref={(node) => { fieldRefs.current[focusIds.indexOf('phone')] = node; }}
                    value={phoneDigits}
                    onFocus={() => setFocusedIndex(focusIds.indexOf('phone'))}
                    onChange={(event) => onPhoneChange(event.target.value)}
                    inputMode="numeric"
                    autoFocus
                    autoComplete="tel-national"
                    maxLength={10}
                    disabled={busy}
                    placeholder="501234567"
                    className="hc-input flex-1 text-left text-lg"
                  />
                </div>
                <div className="mt-3 text-sm text-white/55">
                  המספר שיישלח: <span className="text-white">{phoneE164 || `${TELEGRAM_DEFAULT_COUNTRY_CODE}...`}</span>
                </div>
                <button
                  ref={(node) => { fieldRefs.current[focusIds.indexOf('submit')] = node; }}
                  onFocus={() => setFocusedIndex(focusIds.indexOf('submit'))}
                  onClick={onStartLogin}
                  disabled={busy || !canStartLogin}
                  className="hc-button hc-button--telegram mt-6 w-full justify-center px-6 py-4 text-base"
                >
                  {busy ? <Loader2 size={18} className="animate-spin" /> : <ShieldCheck size={18} />}
                  <span>{phoneE164 ? `שלח קוד ל־${phoneE164}` : 'שלח קוד אימות'}</span>
                </button>
              </>
            )}

            {step === 'code' && (
              <>
                <label className="block text-sm text-white/55">קוד אימות</label>
                <input
                  ref={(node) => { fieldRefs.current[focusIds.indexOf('code')] = node; }}
                  value={code}
                  onFocus={() => setFocusedIndex(focusIds.indexOf('code'))}
                  onChange={(event) => onCodeChange(event.target.value)}
                  inputMode="numeric"
                  autoFocus
                  placeholder="12345"
                  className="hc-input mt-3 text-center text-2xl tracking-[0.32em]"
                />
                <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                  <button
                    ref={(node) => { fieldRefs.current[focusIds.indexOf('submit')] = node; }}
                    onFocus={() => setFocusedIndex(focusIds.indexOf('submit'))}
                    onClick={onSubmitCode}
                    disabled={busy || !code.trim()}
                    className="hc-button hc-button--telegram flex-1 justify-center px-6 py-4 text-base"
                  >
                    {busy ? <Loader2 size={18} className="animate-spin" /> : <ShieldCheck size={18} />}
                    <span>אמת קוד</span>
                  </button>
                  <button
                    ref={(node) => { fieldRefs.current[focusIds.indexOf('resend')] = node; }}
                    onFocus={() => setFocusedIndex(focusIds.indexOf('resend'))}
                    onClick={onResendCode}
                    disabled={busy || !canStartLogin}
                    className="hc-button hc-button--ghost flex-1 justify-center px-6 py-4 text-base"
                  >
                    שלח שוב קוד
                  </button>
                </div>
              </>
            )}

            {step === 'password' && (
              <>
                <label className="block text-sm text-white/55">קוד אימות דו שלבי</label>
                <input
                  ref={(node) => { fieldRefs.current[focusIds.indexOf('password')] = node; }}
                  value={password}
                  onFocus={() => setFocusedIndex(focusIds.indexOf('password'))}
                  onChange={(event) => onPasswordChange(event.target.value)}
                  type="password"
                  autoFocus
                  placeholder="הזן את הקוד"
                  className="hc-input mt-3 text-lg"
                />
                <button
                  ref={(node) => { fieldRefs.current[focusIds.indexOf('submit')] = node; }}
                  onFocus={() => setFocusedIndex(focusIds.indexOf('submit'))}
                  onClick={onSubmitPassword}
                  disabled={busy || !password.trim()}
                  className="hc-button hc-button--magenta mt-6 w-full justify-center px-6 py-4 text-base"
                >
                  {busy ? <Loader2 size={18} className="animate-spin" /> : <ShieldCheck size={18} />}
                  <span>סיים התחברות</span>
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
