import React from 'react';
import { Loader2, LogIn, LogOut, Play, RefreshCw, ShieldCheck, Subtitles } from 'lucide-react';
import type { CorridorItem } from '../utils/contentModel';
import type {
  TelegramAuthStatus,
  TelegramSearchResult,
  TelegramSubtitleResult
} from '../utils/telegramPlayer';
import { TELEGRAM_DEFAULT_COUNTRY_CODE } from '../utils/telegramLogin';

type TelegramConsolePanelProps = {
  configured: boolean;
  status: TelegramAuthStatus;
  busy: boolean;
  sourceSearchBusy: boolean;
  subtitleSearchBusy: boolean;
  preparingSourceId: number | null;
  error: string | null;
  currentItem: CorridorItem | null;
  currentPlaybackTitle: string | null;
  preparedNextTitle: string | null;
  phoneDigits: string;
  phoneE164: string;
  canStartLogin: boolean;
  code: string;
  password: string;
  searchQuery: string;
  sources: TelegramSearchResult[];
  subtitles: TelegramSubtitleResult[];
  selectedSubtitleUrl: string | null;
  onPhoneChange: (value: string) => void;
  onCodeChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSearchQueryChange: (value: string) => void;
  onSelectedSubtitleChange: (value: string | null) => void;
  onRefreshStatus: () => void;
  onStartLogin: () => void;
  onResendCode: () => void;
  onSubmitCode: () => void;
  onSubmitPassword: () => void;
  onLogout: () => void;
  onSearchSources: () => void;
  onSearchSubtitles: () => void;
  onPlaySource: (source: TelegramSearchResult) => void;
  formatBytes: (bytes: number) => string;
};

const STATUS_COPY: Record<TelegramAuthStatus, { title: string; body: string }> = {
  checking: {
    title: 'בודק חיבור לטלגרם',
    body: 'בודקים אם כבר קיימת התחברות פעילה לחשבון שלך.'
  },
  loggedOut: {
    title: 'חיבור לטלגרם',
    body: 'התחבר עם מספר הטלפון שלך כדי לחפש מקורות ולנגן ישירות מתוך האפליקציה.'
  },
  phoneInput: {
    title: 'שלב 1: מספר טלפון',
    body: 'הזן את מספר הנייד הישראלי שלך. הקידומת +972 כבר מוכנה.'
  },
  codeInput: {
    title: 'שלב 2: קוד אימות',
    body: 'קוד האימות נשלח אל טלגרם. הזן אותו כאן כדי להמשיך.'
  },
  passwordInput: {
    title: 'שלב 3: אימות דו שלבי',
    body: 'לחשבון הזה מופעלת סיסמת אבטחה נוספת. הזן אותה כדי להשלים את ההתחברות.'
  },
  loggedIn: {
    title: 'טלגרם מחובר',
    body: 'החשבון מחובר. אפשר לבחור תוכן, לחפש מקורות ולהעביר לנגן.'
  }
};

const AUTH_STEPS = [
  { id: 'phone', label: 'מספר טלפון' },
  { id: 'code', label: 'קוד אימות' },
  { id: 'password', label: 'אימות דו שלבי' }
] as const;

const isPlayableSelection = (item: CorridorItem | null) =>
  !!item && (item.mediaType === 'movie' || item.mediaType === 'episode');

const getActiveStepIndex = (status: TelegramAuthStatus) => {
  if (status === 'passwordInput') {
    return 2;
  }

  if (status === 'codeInput') {
    return 1;
  }

  return 0;
};

const renderStepState = (status: TelegramAuthStatus, index: number) => {
  if (status === 'loggedIn') {
    return 'done';
  }

  const activeIndex = getActiveStepIndex(status);
  if (index < activeIndex) {
    return 'done';
  }

  if (index === activeIndex) {
    return 'active';
  }

  return 'idle';
};

export const TelegramConsolePanel = ({
  configured,
  status,
  busy,
  sourceSearchBusy,
  subtitleSearchBusy,
  preparingSourceId,
  error,
  currentItem,
  currentPlaybackTitle,
  preparedNextTitle,
  phoneDigits,
  phoneE164,
  canStartLogin,
  code,
  password,
  searchQuery,
  sources,
  subtitles,
  selectedSubtitleUrl,
  onPhoneChange,
  onCodeChange,
  onPasswordChange,
  onSearchQueryChange,
  onSelectedSubtitleChange,
  onRefreshStatus,
  onStartLogin,
  onResendCode,
  onSubmitCode,
  onSubmitPassword,
  onLogout,
  onSearchSources,
  onSearchSubtitles,
  onPlaySource,
  formatBytes
}: TelegramConsolePanelProps) => {
  const statusCopy = STATUS_COPY[status];
  const isLoggedIn = status === 'loggedIn';
  const isCodeStep = status === 'codeInput';
  const isPasswordStep = status === 'passwordInput';
  const playableSelection = isPlayableSelection(currentItem);
  const visiblePhone = phoneE164 || `${TELEGRAM_DEFAULT_COUNTRY_CODE}...`;

  if (!configured) {
    return (
      <section className="hc-panel-section mt-8 p-8">
        <div className="max-w-3xl">
          <div className="hc-badge hc-badge--telegram">
            <ShieldCheck size={16} />
            <span>טלגרם</span>
          </div>
          <h3 className="mt-4 text-3xl font-semibold text-white">חיבור טלגרם עדיין לא מוגדר</h3>
          <p className="hc-subtitle mt-3 text-base">
            כדי להתחבר צריך להגדיר בשרת את <code>TG_API_ID</code> ואת <code>TG_API_HASH</code>.
          </p>
        </div>
      </section>
    );
  }

  if (!isLoggedIn) {
    return (
      <section className="hc-panel-section mt-8 p-8" data-tv-scope="ui">
        <div className="mx-auto max-w-3xl">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="hc-badge hc-badge--telegram">
                <ShieldCheck size={16} />
                <span>חיבור לטלגרם</span>
              </div>
              <h3 className="mt-4 text-3xl font-semibold text-white">{statusCopy.title}</h3>
              <p className="hc-subtitle mt-3 text-base">{statusCopy.body}</p>
            </div>
            <button
              onClick={onRefreshStatus}
              disabled={busy}
              className="hc-button hc-button--ghost px-4 py-3 text-sm"
            >
              <RefreshCw size={16} className={busy ? 'animate-spin' : ''} />
              <span>רענון</span>
            </button>
          </div>

          <div className="mt-8 grid gap-3 md:grid-cols-3">
            {AUTH_STEPS.map((step, index) => {
              const state = renderStepState(status, index);
              return (
                <div
                  key={step.id}
                  className={`hc-card px-4 py-4 text-right ${
                    state === 'done'
                      ? 'border-emerald-400/25 bg-emerald-500/10 text-emerald-100'
                      : state === 'active'
                        ? 'border-[#2AABEE]/30 bg-[#2AABEE]/12 text-white'
                        : 'text-white/50'
                  }`}
                >
                  <div className="text-[11px] uppercase tracking-[0.24em] text-white/45">שלב {index + 1}</div>
                  <div className="mt-2 text-sm font-semibold">{step.label}</div>
                </div>
              );
            })}
          </div>

          {error && (
            <div className="mt-6 rounded-[24px] border border-red-400/20 bg-red-500/10 px-5 py-4 text-sm text-red-100">
              {error}
            </div>
          )}

          <div className="hc-card mt-8 space-y-6 p-6">
            <div>
              <label className="block text-sm text-white/55">מספר טלפון</label>
              <div className="mt-3 flex items-center gap-3">
                <div className="hc-input w-auto min-w-[7rem] bg-white/[0.03] text-center text-lg text-white">
                  {TELEGRAM_DEFAULT_COUNTRY_CODE}
                </div>
                <input
                  value={phoneDigits}
                  onChange={(event) => onPhoneChange(event.target.value)}
                  inputMode="numeric"
                  autoComplete="tel-national"
                  maxLength={10}
                  disabled={isCodeStep || isPasswordStep || busy}
                  placeholder="501234567"
                  className="hc-input flex-1 text-left text-lg"
                />
              </div>
              <div className="mt-3 text-sm text-white/55">
                המספר שיישלח: <span className="text-white">{visiblePhone}</span>
              </div>
              <button
                onClick={onStartLogin}
                disabled={busy || !canStartLogin}
                className="hc-button hc-button--telegram mt-5 w-full justify-center px-6 py-4 text-base"
              >
                {busy && !isCodeStep && !isPasswordStep ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <LogIn size={18} />
                )}
                <span>{phoneE164 ? `שלח קוד ל־${phoneE164}` : 'שלח קוד אימות'}</span>
              </button>
            </div>

            {isCodeStep && (
              <div className="border-t border-white/10 pt-6">
                <label className="block text-sm text-white/55">קוד אימות</label>
                <input
                  value={code}
                  onChange={(event) => onCodeChange(event.target.value)}
                  inputMode="numeric"
                  placeholder="12345"
                  className="hc-input mt-3 text-center text-2xl tracking-[0.32em]"
                />
                <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                  <button
                    onClick={onSubmitCode}
                    disabled={busy || !code.trim()}
                    className="hc-button hc-button--telegram flex-1 justify-center px-6 py-4 text-base"
                  >
                    {busy ? <Loader2 size={18} className="animate-spin" /> : <ShieldCheck size={18} />}
                    <span>אמת קוד</span>
                  </button>
                  <button
                    onClick={onResendCode}
                    disabled={busy || !canStartLogin}
                    className="hc-button hc-button--ghost flex-1 justify-center px-6 py-4 text-base"
                  >
                    שלח שוב קוד
                  </button>
                </div>
              </div>
            )}

            {isPasswordStep && (
              <div className="border-t border-white/10 pt-6">
                <label className="block text-sm text-white/55">סיסמת אימות דו שלבי</label>
                <input
                  value={password}
                  onChange={(event) => onPasswordChange(event.target.value)}
                  type="password"
                  placeholder="הזן את הסיסמה"
                  className="hc-input mt-3 text-lg"
                />
                <button
                  onClick={onSubmitPassword}
                  disabled={busy || !password.trim()}
                  className="hc-button hc-button--magenta mt-5 w-full justify-center px-6 py-4 text-base"
                >
                  {busy ? <Loader2 size={18} className="animate-spin" /> : <ShieldCheck size={18} />}
                  <span>התחבר</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </section>
    );
  }

  return (
    <div className="mt-8 grid gap-6 xl:grid-cols-[1.1fr,0.9fr]" data-tv-scope="ui">
      <section className="hc-panel-section p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="hc-badge hc-badge--telegram">
              <ShieldCheck size={16} />
              <span>טלגרם מחובר</span>
            </div>
            <h3 className="mt-4 text-3xl font-semibold text-white">החשבון שלך מוכן לשימוש</h3>
            <p className="hc-subtitle mt-3 text-base">
              בחר סרט או פרק, חפש מקורות, ושלח את מה שמצאת לנגן.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={onRefreshStatus}
              disabled={busy}
              className="hc-button hc-button--ghost px-4 py-3 text-sm"
            >
              <RefreshCw size={16} className={busy ? 'animate-spin' : ''} />
              <span>רענון</span>
            </button>
            <button
              onClick={onLogout}
              disabled={busy}
              className="hc-button hc-button--danger px-4 py-3 text-sm"
            >
              <LogOut size={16} />
              <span>ניתוק</span>
            </button>
          </div>
        </div>

        {preparedNextTitle && (
          <div className="mt-6 rounded-[24px] border border-emerald-400/20 bg-emerald-500/10 px-5 py-4 text-sm text-emerald-100">
            הפרק הבא כבר מוכן: {preparedNextTitle}
          </div>
        )}

        {error && (
          <div className="mt-6 rounded-[24px] border border-red-400/20 bg-red-500/10 px-5 py-4 text-sm text-red-100">
            {error}
          </div>
        )}

        <div className="hc-card mt-6 p-5">
          <div className="text-sm text-white/55">התוכן שנבחר</div>
          <div className="mt-2 text-2xl font-semibold text-white">
            {currentItem ? currentItem.title : 'עדיין לא נבחר תוכן'}
          </div>
          {currentItem?.seriesTitle && (
            <div className="mt-2 text-sm text-[#7debd6]">{currentItem.seriesTitle}</div>
          )}
          {currentPlaybackTitle && (
            <div className="mt-4 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-100">
              מנגן עכשיו: {currentPlaybackTitle}
            </div>
          )}

          {!playableSelection ? (
            <div className="hc-card mt-5 px-4 py-3 text-sm text-white/65">
              כדי לחפש מקורות, בחר סרט או פרק בודד מתוך המסדרון.
            </div>
          ) : (
            <>
              <label className="mt-5 block text-sm text-white/55">חיפוש מקורות בטלגרם</label>
              <div className="mt-3 flex flex-col gap-3 lg:flex-row">
                <input
                  value={searchQuery}
                  onChange={(event) => onSearchQueryChange(event.target.value)}
                  className="hc-input flex-1 text-base"
                />
                <button
                  onClick={onSearchSources}
                  disabled={busy || sourceSearchBusy || !searchQuery.trim()}
                  className="hc-button hc-button--telegram px-6 py-3 text-sm"
                >
                  {sourceSearchBusy ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />}
                  <span>{sourceSearchBusy ? 'מחפש מקורות...' : 'חפש מקורות'}</span>
                </button>
              </div>
            </>
          )}
        </div>

        {playableSelection && (
          <div className="hc-card mt-6 p-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3 text-white">
                <Subtitles size={18} className="text-[#7debd6]" />
                <div>
                  <div className="text-lg font-semibold">כתוביות</div>
                  <div className="text-sm text-white/55">אפשר לבחור כתובית לפני שליחה לנגן.</div>
                </div>
              </div>
              <button
                onClick={onSearchSubtitles}
                disabled={busy || subtitleSearchBusy}
                className="hc-button hc-button--ghost px-4 py-3 text-sm"
              >
                {subtitleSearchBusy ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                <span>{subtitleSearchBusy ? 'מחפש...' : 'רענן כתוביות'}</span>
              </button>
            </div>

            {subtitles.length > 0 ? (
              <div className="mt-4 space-y-3">
                <label className="block text-sm text-white/55">כתובית נבחרת</label>
                <select
                  value={selectedSubtitleUrl ?? ''}
                  onChange={(event) => onSelectedSubtitleChange(event.target.value || null)}
                  className="hc-select text-sm"
                >
                  <option value="">ללא כתוביות</option>
                  {subtitles.map((subtitle) => (
                    <option key={`${subtitle.peerId}:${subtitle.id}`} value={subtitle.subtitleUrl}>
                      {subtitle.title}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="mt-4 text-sm text-white/50">עדיין לא נמצאו כתוביות לתוכן הזה.</div>
            )}
          </div>
        )}
      </section>

      <section className="hc-panel-section p-6">
        <h3 className="text-2xl font-semibold text-white">מקורות זמינים</h3>
        <p className="hc-subtitle mt-3 text-sm">
          כאן מופיעות תוצאות החיפוש מטלגרם. בחר מקור אחד כדי לפתוח אותו בנגן.
        </p>

        {playableSelection && sources.length === 0 && !sourceSearchBusy && (
          <div className="hc-card mt-6 px-5 py-4 text-sm text-white/55">עדיין אין מקורות. הפעל חיפוש כדי למלא את הרשימה.</div>
        )}

        <div className="mt-6 space-y-4">
          {sources.map((source) => {
            const preparing = preparingSourceId === source.id;
            return (
              <div key={`${source.peerId}:${source.id}`} className="hc-card p-4">
                <div className="flex flex-col gap-3">
                  <div>
                    <div className="text-base font-semibold text-white">{source.title}</div>
                    <div className="mt-2 text-sm text-white/45">{source.chatName || 'ערוץ טלגרם'}</div>
                  </div>
                  <div className="hc-chip-row text-xs text-white/55">
                    {source.fileName && <span className="hc-chip">{source.fileName}</span>}
                    {source.sizeBytes ? (
                      <span className="hc-chip">{formatBytes(source.sizeBytes)}</span>
                    ) : source.size ? (
                      <span className="hc-chip">{source.size}</span>
                    ) : null}
                    {source.durationSeconds ? (
                      <span className="hc-chip">{Math.round(source.durationSeconds / 60)} דקות</span>
                    ) : null}
                  </div>
                  <button
                    onClick={() => onPlaySource(source)}
                    disabled={busy || preparing}
                    className="hc-button hc-button--telegram w-full justify-center px-5 py-3 text-sm"
                  >
                    {preparing ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                    <span>{preparing ? 'מכין ניגון...' : 'נגן עכשיו'}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};
