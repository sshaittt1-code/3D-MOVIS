import React from 'react';
import { Loader2, LogIn, LogOut, Play, RefreshCw, ShieldCheck, Subtitles, Tv } from 'lucide-react';
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

const STATUS_COPY: Record<TelegramAuthStatus, { title: string; tone: string; body: string }> = {
  checking: {
    title: 'בודק חיבור ל-Telegram',
    tone: 'border-amber-400/25 bg-amber-500/12 text-amber-100',
    body: 'אנחנו מאמתים אם כבר קיימת התחברות פעילה לפני שניגש למקורות ולניגון.'
  },
  loggedOut: {
    title: 'חשבון Telegram לא מחובר',
    tone: 'border-white/10 bg-white/[0.04] text-white/75',
    body: 'התחבר עם מספר הטלפון שלך כדי לפתוח חיפוש מקורות, כתוביות והעברה לנגן.'
  },
  phoneInput: {
    title: 'הזן מספר טלפון',
    tone: 'border-[#2AABEE]/30 bg-[#2AABEE]/12 text-white',
    body: 'הקידומת הישראלית קבועה ל־+972. הזן רק את הספרות של המספר המקומי.'
  },
  codeInput: {
    title: 'הזן קוד אימות',
    tone: 'border-[#2AABEE]/30 bg-[#2AABEE]/12 text-white',
    body: 'Telegram שלח קוד אימות. הזן אותו כאן כדי להמשיך לשלב הבא.'
  },
  passwordInput: {
    title: 'נדרשת סיסמת אבטחה',
    tone: 'border-fuchsia-400/30 bg-fuchsia-500/12 text-white',
    body: 'לחשבון הזה מופעלת הגנת 2FA. הזן את סיסמת האבטחה כדי להשלים את ההתחברות.'
  },
  loggedIn: {
    title: 'Telegram מחובר ומוכן',
    tone: 'border-emerald-400/30 bg-emerald-500/14 text-emerald-100',
    body: 'החיבור פעיל. אפשר לבחור סרט או פרק, לחפש מקורות ולהעביר לנגן.'
  }
};

const isPlayableSelection = (item: CorridorItem | null) =>
  !!item && (item.mediaType === 'movie' || item.mediaType === 'episode');

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
  const playableSelection = isPlayableSelection(currentItem);
  const busyIndicator = busy || sourceSearchBusy || subtitleSearchBusy;
  const isCodeStep = status === 'codeInput';
  const isPasswordStep = status === 'passwordInput';
  const isLoggedIn = status === 'loggedIn';
  const activeStepIndex = isPasswordStep ? 2 : isCodeStep ? 1 : 0;
  const wizardSteps = [
    { id: 'phone', label: 'מספר טלפון' },
    { id: 'code', label: 'קוד אימות' },
    { id: 'password', label: 'סיסמת אבטחה' }
  ];

  return (
    <div className="mt-8 grid gap-6 xl:grid-cols-[1.25fr,0.9fr]">
      <section className="hc-panel-section p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="hc-badge hc-badge--telegram">
              <ShieldCheck size={16} />
              <span>מסוף התחברות Telegram</span>
            </div>
            <h3 className="mt-4 text-2xl font-semibold text-white">{statusCopy.title}</h3>
            <p className="hc-subtitle mt-3 max-w-2xl text-sm">{statusCopy.body}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={onRefreshStatus}
              disabled={busy}
              className="hc-button hc-button--ghost px-4 py-3 text-sm"
            >
              <RefreshCw size={16} className={busy ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </button>
            {status === 'loggedIn' && (
              <button
                onClick={onLogout}
                disabled={busy}
                className="hc-button hc-button--danger px-4 py-3 text-sm"
              >
                <LogOut size={16} />
                <span>Disconnect</span>
              </button>
            )}
          </div>
        </div>

        {!configured && (
          <div className="mt-6 rounded-[24px] border border-red-400/20 bg-red-500/10 px-5 py-4 text-sm text-red-100">
            Telegram API עדיין לא מוגדר בשרת. צריך להגדיר `TG_API_ID` ו־`TG_API_HASH` כדי להתחבר.
          </div>
        )}

        <div className={`hc-meter mt-6 ${statusCopy.tone}`}>
          <span className={`h-2.5 w-2.5 rounded-full ${busyIndicator ? 'animate-pulse bg-current' : 'bg-current'}`} />
          <span>{statusCopy.title}</span>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-3">
          {wizardSteps.map((step, index) => {
            const isCompleted = isLoggedIn || index < activeStepIndex;
            const isActive = !isLoggedIn && index === activeStepIndex;
            return (
              <div
                key={step.id}
                className={`hc-card px-4 py-3 text-right ${
                  isCompleted
                    ? 'border-emerald-400/25 bg-emerald-500/10 text-emerald-100'
                    : isActive
                      ? 'border-[#2AABEE]/30 bg-[#2AABEE]/12 text-white'
                      : 'text-white/55'
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

        <div className="hc-card mt-8 p-5">
          <label className="block text-sm text-white/55">מספר טלפון ישראלי</label>
          <div className="mt-3 flex items-center gap-3">
            <div className="hc-input w-auto min-w-[6.5rem] bg-white/[0.03] text-center text-lg text-white/75">
              {TELEGRAM_DEFAULT_COUNTRY_CODE}
            </div>
            <input
              value={phoneDigits}
              onChange={(event) => onPhoneChange(event.target.value)}
              inputMode="numeric"
              autoComplete="tel-national"
              maxLength={10}
              disabled={isCodeStep || isPasswordStep || isLoggedIn}
              placeholder="501234567"
              className="hc-input flex-1 text-left text-lg"
            />
          </div>
          <div className="mt-3 text-sm text-white/50">
            המספר המלא שיישלח: <span className="text-white">{phoneE164 || `${TELEGRAM_DEFAULT_COUNTRY_CODE}...`}</span>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              onClick={onStartLogin}
              disabled={busy || !canStartLogin || !configured || isLoggedIn}
              className="hc-button hc-button--telegram px-6 py-3 text-sm"
            >
              <LogIn size={16} />
              <span>{phoneE164 ? `שלח קוד ל־${phoneE164}` : 'שלח קוד אימות'}</span>
            </button>
            {isCodeStep && (
              <button
                onClick={onResendCode}
                disabled={busy || !canStartLogin}
                className="hc-button hc-button--ghost px-6 py-3 text-sm"
              >
                שלח שוב קוד
              </button>
            )}
          </div>
        </div>

        {isCodeStep && (
          <div className="hc-card mt-8 p-5">
            <label className="block text-sm text-white/55">קוד אימות שנשלח ב־Telegram</label>
            <input
              value={code}
              onChange={(event) => onCodeChange(event.target.value)}
              inputMode="numeric"
              placeholder="12345"
              className="hc-input mt-3 text-lg"
            />
            <button
              onClick={onSubmitCode}
              disabled={busy || !code.trim()}
              className="hc-button hc-button--telegram mt-5 px-6 py-3 text-sm"
            >
              אמת קוד
            </button>
          </div>
        )}

        {isPasswordStep && (
          <div className="hc-card mt-8 p-5">
            <label className="block text-sm text-white/55">סיסמת אבטחה של Telegram</label>
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
              className="hc-button hc-button--magenta mt-5 px-6 py-3 text-sm"
            >
              אמת סיסמה
            </button>
          </div>
        )}

        {isLoggedIn && (
          <div className="mt-8 space-y-5">
            <div className="hc-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-sm text-white/55">Selected media</div>
                  <div className="mt-2 text-xl font-semibold text-white">
                    {currentItem ? currentItem.title : 'Nothing selected yet'}
                  </div>
                  {currentItem?.seriesTitle && (
                    <div className="mt-2 text-sm text-[#7debd6]">{currentItem.seriesTitle}</div>
                  )}
                </div>
                {currentPlaybackTitle && (
                  <div className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-100">
                    Playing: {currentPlaybackTitle}
                  </div>
                )}
              </div>

              {!playableSelection && (
                <div className="hc-card mt-5 px-4 py-3 text-sm text-white/65">
                  Pick a movie or a specific episode to search Telegram sources. Series and seasons stay in the corridor hierarchy until you drill down to a playable item.
                </div>
              )}

              {playableSelection && (
                <>
                  <label className="mt-5 block text-sm text-white/55">Source search query</label>
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
                      {sourceSearchBusy ? 'Searching...' : 'Find sources'}
                    </button>
                  </div>
                </>
              )}
            </div>

            {playableSelection && (
              <div className="hc-card p-5">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3 text-white">
                    <Subtitles size={18} className="text-[#7debd6]" />
                    <div>
                      <div className="text-lg font-semibold">Subtitles</div>
                      <div className="text-sm text-white/55">Search once, then choose the track you want to send to MX / Native Player.</div>
                    </div>
                  </div>
                  <button
                    onClick={onSearchSubtitles}
                    disabled={busy || subtitleSearchBusy}
                    className="hc-button hc-button--ghost px-4 py-3 text-sm"
                  >
                    {subtitleSearchBusy ? 'Searching...' : 'Refresh subtitles'}
                  </button>
                </div>

                {subtitles.length > 0 ? (
                  <div className="mt-4 space-y-3">
                    <label className="block text-sm text-white/55">Selected subtitle</label>
                    <select
                      value={selectedSubtitleUrl ?? ''}
                      onChange={(event) => onSelectedSubtitleChange(event.target.value || null)}
                      className="hc-select text-sm"
                    >
                      <option value="">No subtitles</option>
                      {subtitles.map((subtitle) => (
                        <option key={`${subtitle.peerId}:${subtitle.id}`} value={subtitle.subtitleUrl}>
                          {subtitle.title}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="mt-4 text-sm text-white/50">No subtitle candidates cached yet.</div>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      <section className="hc-panel-section p-6">
        <div className="flex items-center gap-3 text-white">
          <Tv size={18} className="text-[#7debd6]" />
          <h3 className="text-2xl font-semibold">Playback queue</h3>
        </div>
        <p className="hc-subtitle mt-3 text-sm">
          These are the Telegram video matches for the currently selected content. Choose a source to hand it off to the native player.
        </p>

        {preparedNextTitle && (
          <div className="mt-5 rounded-[24px] border border-emerald-400/20 bg-emerald-500/10 px-5 py-4 text-sm text-emerald-100">
            Next episode queued: {preparedNextTitle}
          </div>
        )}

        {status === 'loggedIn' && playableSelection && sources.length === 0 && !sourceSearchBusy && (
          <div className="hc-card mt-6 px-5 py-4 text-sm text-white/55">
            Run a Telegram search to populate this queue.
          </div>
        )}

        <div className="mt-6 space-y-4">
          {sources.map((source) => {
            const preparing = preparingSourceId === source.id;
            return (
              <div key={`${source.peerId}:${source.id}`} className="hc-card p-4">
                <div className="flex flex-col gap-3">
                  <div>
                    <div className="text-base font-semibold text-white">{source.title}</div>
                    <div className="mt-2 text-sm text-white/45">{source.chatName || 'Telegram chat'}</div>
                  </div>
                  <div className="hc-chip-row text-xs text-white/55">
                    {source.fileName && <span className="hc-chip">{source.fileName}</span>}
                    {source.sizeBytes ? (
                      <span className="hc-chip">{formatBytes(source.sizeBytes)}</span>
                    ) : source.size ? (
                      <span className="hc-chip">{source.size}</span>
                    ) : null}
                    {source.durationSeconds ? (
                      <span className="hc-chip">{Math.round(source.durationSeconds / 60)} min</span>
                    ) : null}
                  </div>
                  <button
                    onClick={() => onPlaySource(source)}
                    disabled={busy || preparing}
                    className="hc-button hc-button--telegram w-full px-5 py-3 text-sm"
                  >
                    {preparing ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                    <span>{preparing ? 'Preparing playback...' : 'Play in MX / Native Player'}</span>
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
