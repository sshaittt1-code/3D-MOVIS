import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import type { TelegramAuthStatus } from '../utils/telegramPlayer';
import {
  TELEGRAM_DEFAULT_COUNTRY_CODE,
  type TelegramAuthPendingStage
} from '../utils/telegramLogin';
import { isTvBackKey } from '../utils/tvNavigation';
import { getTvDirection, isTvSelectKey, stopTvEvent } from '../utils/tvRemote';

type TelegramAuthWizardProps = {
  configured: boolean;
  status: TelegramAuthStatus;
  busy: boolean;
  pendingStage: TelegramAuthPendingStage;
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

type WizardStep = 'phone' | 'code' | 'password';

const getWizardStep = (
  status: TelegramAuthStatus,
  pendingStage: TelegramAuthPendingStage
): WizardStep => {
  if (pendingStage === 'starting') return 'phone';
  if (status === 'passwordInput') return 'password';
  if (status === 'codeInput') return 'code';
  return 'phone';
};

const STEP_LABELS: Record<WizardStep, { step: string; title: string; subtitle: string }> = {
  phone: {
    step: 'שלב 1',
    title: 'הכנס מספר טלפון',
    subtitle: 'הזן רק את המספר הנייד שלך. הקידומת +972 מתווספת אוטומטית.'
  },
  code: {
    step: 'שלב 2',
    title: 'הכנס קוד אימות',
    subtitle: 'פתח את טלגרם, קח את קוד האימות שהגיע אליך והזן אותו כאן.'
  },
  password: {
    step: 'שלב 3',
    title: 'הכנס אימות דו שלבי',
    subtitle: 'אם לחשבון שלך יש סיסמת אבטחה נוספת, הזן אותה כדי לסיים להתחבר.'
  }
};

export const TelegramAuthWizard = ({
  configured,
  status,
  busy,
  pendingStage,
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
  const step = getWizardStep(status, pendingStage);
  const stepCopy = STEP_LABELS[step];
  const isStarting = pendingStage === 'starting';
  const [focusedIndex, setFocusedIndex] = useState(0);
  const fieldRefs = useRef<Array<HTMLElement | null>>([]);

  const focusIds = useMemo(() => {
    if (!configured) return ['close'];
    if (step === 'phone') return ['phone', 'submit', 'close'];
    if (step === 'code') return ['code', 'submit', 'resend', 'close'];
    return ['password', 'submit', 'close'];
  }, [configured, step]);

  useEffect(() => {
    setFocusedIndex(0);
  }, [step, pendingStage]);

  useEffect(() => {
    fieldRefs.current[focusedIndex]?.focus();
  }, [focusIds, focusedIndex]);

  const bindFieldRef = (id: string) => (node: HTMLElement | null) => {
    const index = focusIds.indexOf(id);
    if (index >= 0) fieldRefs.current[index] = node;
  };

  const focusField = (id: string) => () => {
    const index = focusIds.indexOf(id);
    if (index >= 0) setFocusedIndex(index);
  };

  const moveFocus = (direction: 1 | -1) => {
    setFocusedIndex((current) => Math.max(0, Math.min(focusIds.length - 1, current + direction)));
  };

  const activateCurrent = () => {
    const currentId = focusIds[focusedIndex];
    if (currentId === 'submit') {
      if (step === 'phone') onStartLogin();
      else if (step === 'code') onSubmitCode();
      else onSubmitPassword();
      return;
    }

    if (currentId === 'resend') {
      onResendCode();
      return;
    }

    if (currentId === 'close') onClose();
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
      if (currentId === 'phone' || currentId === 'code' || currentId === 'password') return;
      stopTvEvent(event);
      activateCurrent();
    }
  };

  return (
    <div className="hc-screen-overlay" data-tv-scope="ui">
      <div className="hc-telegram-wizard" data-tv-back-scope="local" onKeyDown={handleKeyDown}>
        <button
          ref={bindFieldRef('close')}
          onFocus={focusField('close')}
          onClick={onClose}
          className="hc-close-button absolute left-6 top-6 p-3"
          aria-label="סגור חיבור לטלגרם"
        >
          <X size={22} />
        </button>

        <div className="text-center">
          <div className="hc-telegram-step-indicator">{stepCopy.step}</div>
          <h2 className="mt-6 text-5xl font-bold text-white">{stepCopy.title}</h2>
          <p className="hc-subtitle mx-auto mt-4 max-w-3xl text-lg">{stepCopy.subtitle}</p>
        </div>

        {!configured ? (
          <div className="mt-8 rounded-[26px] border border-red-400/20 bg-red-500/10 px-6 py-5 text-sm text-red-100">
            Telegram לא מוגדר כרגע בשרת. צריך להגדיר <code>TG_API_ID</code> ו־<code>TG_API_HASH</code>.
          </div>
        ) : null}

        {isStarting ? (
          <div className="mt-8 flex items-center justify-center gap-3 rounded-[26px] border border-cyan-400/20 bg-cyan-500/10 px-6 py-5 text-sm text-cyan-50">
            <Loader2 size={18} className="animate-spin" />
            <span>שולח קוד לטלגרם. זה יכול לקחת כמה שניות...</span>
          </div>
        ) : null}

        {error && !isStarting ? (
          <div className="mt-8 rounded-[26px] border border-red-400/15 bg-red-500/10 px-6 py-5 text-sm text-red-100">
            {error}
          </div>
        ) : null}

        <div className="mt-10 rounded-[32px] border border-white/8 bg-black/18 px-8 py-8">
          {step === 'phone' && (
            <>
              <label className="block text-sm text-white/55">מספר טלפון</label>
              <div className="mt-3 flex items-center gap-3">
                <div className="hc-telegram-prefix">{TELEGRAM_DEFAULT_COUNTRY_CODE}</div>
                <input
                  ref={bindFieldRef('phone')}
                  value={phoneDigits}
                  onFocus={focusField('phone')}
                  onChange={(event) => onPhoneChange(event.target.value)}
                  inputMode="numeric"
                  autoFocus
                  autoComplete="tel-national"
                  maxLength={10}
                  disabled={busy || isStarting}
                  placeholder="501234567"
                  className="hc-input flex-1 text-left text-2xl"
                />
              </div>
              <div className="mt-4 text-sm text-white/55">
                המספר שיישלח: <span className="text-white">{phoneE164 || `${TELEGRAM_DEFAULT_COUNTRY_CODE}...`}</span>
              </div>
              <button
                ref={bindFieldRef('submit')}
                onFocus={focusField('submit')}
                onClick={onStartLogin}
                disabled={busy || isStarting || !canStartLogin}
                className="hc-button hc-button--telegram mt-8 w-full justify-center px-6 py-4 text-base"
              >
                {busy || isStarting ? <Loader2 size={18} className="animate-spin" /> : null}
                <span>{isStarting ? 'שולח קוד...' : (phoneE164 ? `שלח קוד ל־${phoneE164}` : 'שלח קוד אימות')}</span>
              </button>
            </>
          )}

          {step === 'code' && (
            <>
              <label className="block text-sm text-white/55">קוד אימות</label>
              <input
                ref={bindFieldRef('code')}
                value={code}
                onFocus={focusField('code')}
                onChange={(event) => onCodeChange(event.target.value)}
                inputMode="numeric"
                autoFocus
                placeholder="12345"
                className="hc-input mt-3 text-center text-3xl tracking-[0.28em]"
              />
              <button
                ref={bindFieldRef('submit')}
                onFocus={focusField('submit')}
                onClick={onSubmitCode}
                disabled={busy || !code.trim()}
                className="hc-button hc-button--telegram mt-8 w-full justify-center px-6 py-4 text-base"
              >
                {busy ? <Loader2 size={18} className="animate-spin" /> : null}
                <span>אמת קוד</span>
              </button>
              <button
                ref={bindFieldRef('resend')}
                onFocus={focusField('resend')}
                onClick={onResendCode}
                disabled={busy || !canStartLogin}
                className="hc-button hc-button--ghost mt-3 w-full justify-center px-6 py-4 text-base"
              >
                שלח שוב קוד
              </button>
            </>
          )}

          {step === 'password' && (
            <>
              <label className="block text-sm text-white/55">אימות דו שלבי</label>
              <input
                ref={bindFieldRef('password')}
                value={password}
                onFocus={focusField('password')}
                onChange={(event) => onPasswordChange(event.target.value)}
                type="password"
                autoFocus
                placeholder="הזן את סיסמת האבטחה שלך"
                className="hc-input mt-3 text-xl"
              />
              <button
                ref={bindFieldRef('submit')}
                onFocus={focusField('submit')}
                onClick={onSubmitPassword}
                disabled={busy || !password.trim()}
                className="hc-button hc-button--telegram mt-8 w-full justify-center px-6 py-4 text-base"
              >
                {busy ? <Loader2 size={18} className="animate-spin" /> : null}
                <span>סיים התחברות</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
