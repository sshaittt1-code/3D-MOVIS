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

const STEP_TITLES: Record<WizardStep, string> = {
  phone: 'הכנס מספר טלפון',
  code: 'הכנס קוד אימות',
  password: 'הכנס קוד אימות דו שלבי'
};

const STEP_TEXT: Record<WizardStep, string> = {
  phone: 'הזן רק את המספר הנייד שלך. הקידומת +972 כבר מתווספת אוטומטית.',
  code: 'קוד האימות נשלח לחשבון הטלגרם שלך. הזן אותו כדי להמשיך.',
  password: 'אם בחשבון שלך מופעל אימות דו שלבי, הזן כאן את סיסמת האבטחה.'
};

const getWizardStep = (status: TelegramAuthStatus): WizardStep => {
  if (status === 'passwordInput') return 'password';
  if (status === 'codeInput') return 'code';
  return 'phone';
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
  const step = getWizardStep(status);
  const isStarting = pendingStage === 'starting';
  const [focusedIndex, setFocusedIndex] = useState(0);
  const fieldRefs = useRef<Array<HTMLElement | null>>([]);

  const focusIds = useMemo(() => {
    if (!configured) {
      return ['close'];
    }

    if (step === 'phone' && isStarting) {
      return ['close'];
    }

    if (step === 'phone') {
      return ['phone', 'submit', 'close'];
    }

    if (step === 'code') {
      return ['code', 'submit', 'resend', 'close'];
    }

    return ['password', 'submit', 'close'];
  }, [configured, isStarting, step]);

  useEffect(() => {
    setFocusedIndex(0);
  }, [step, pendingStage]);

  useEffect(() => {
    fieldRefs.current[focusedIndex]?.focus();
  }, [focusIds, focusedIndex]);

  const bindFieldRef = (id: string) => (node: HTMLElement | null) => {
    const index = focusIds.indexOf(id);
    if (index >= 0) {
      fieldRefs.current[index] = node;
    }
  };

  const focusField = (id: string) => () => {
    const index = focusIds.indexOf(id);
    if (index >= 0) {
      setFocusedIndex(index);
    }
  };

  const moveFocus = (direction: 1 | -1) => {
    setFocusedIndex((current) => Math.max(0, Math.min(focusIds.length - 1, current + direction)));
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

  const renderStepContent = () => {
    if (!configured) {
      return (
        <div className="rounded-[26px] border border-red-400/20 bg-red-500/10 px-6 py-5 text-sm text-red-100">
          חיבור Telegram לא מוגדר כרגע בשרת. צריך להגדיר <code>TG_API_ID</code> ו־<code>TG_API_HASH</code>.
        </div>
      );
    }

    if (step === 'phone') {
      return (
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
            <span>{isStarting ? 'שולח קוד לטלגרם...' : (phoneE164 ? `שלח קוד ל־${phoneE164}` : 'שלח קוד אימות')}</span>
          </button>
        </>
      );
    }

    if (step === 'code') {
      return (
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
      );
    }

    return (
      <>
        <label className="block text-sm text-white/55">אימות דו שלבי</label>
        <input
          ref={bindFieldRef('password')}
          value={password}
          onFocus={focusField('password')}
          onChange={(event) => onPasswordChange(event.target.value)}
          type="password"
          autoFocus
          placeholder="הזן את סיסמת האבטחה"
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
    );
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
          <div className="hc-telegram-step-indicator">
            שלב {step === 'phone' ? '1' : step === 'code' ? '2' : '3'}
          </div>
          <h2 className="mt-6 text-5xl font-bold text-white">{STEP_TITLES[step]}</h2>
          <p className="hc-subtitle mx-auto mt-4 max-w-3xl text-lg">{STEP_TEXT[step]}</p>
        </div>

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
          {renderStepContent()}
        </div>
      </div>
    </div>
  );
};
