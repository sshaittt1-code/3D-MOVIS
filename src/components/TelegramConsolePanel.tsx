import React from 'react';
import { Loader2, LogIn, LogOut, Play, RefreshCw, ShieldCheck, Subtitles, Tv } from 'lucide-react';
import type { CorridorItem } from '../utils/contentModel';
import type {
  TelegramAuthStatus,
  TelegramSearchResult,
  TelegramSubtitleResult
} from '../utils/telegramPlayer';

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
  phone: string;
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
    title: 'Checking Telegram',
    tone: 'border-amber-400/25 bg-amber-500/12 text-amber-100',
    body: 'We are validating the current Telegram session before opening media sources.'
  },
  loggedOut: {
    title: 'Telegram is disconnected',
    tone: 'border-white/10 bg-white/[0.04] text-white/75',
    body: 'Sign in with your Telegram account to unlock source search and playback handoff.'
  },
  phoneInput: {
    title: 'Enter phone number',
    tone: 'border-[#2AABEE]/30 bg-[#2AABEE]/12 text-white',
    body: 'Start the MTProto login flow by sending your phone number to the backend.'
  },
  codeInput: {
    title: 'Enter verification code',
    tone: 'border-[#2AABEE]/30 bg-[#2AABEE]/12 text-white',
    body: 'Telegram sent you a code. Submit it here to continue.'
  },
  passwordInput: {
    title: 'Two-factor password required',
    tone: 'border-fuchsia-400/30 bg-fuchsia-500/12 text-white',
    body: 'This account uses Telegram cloud password protection. Submit the password to finish the login.'
  },
  loggedIn: {
    title: 'Telegram is connected',
    tone: 'border-emerald-400/30 bg-emerald-500/14 text-emerald-100',
    body: 'Source search is ready. Pick a movie or episode and stream it with the native player.'
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
  phone,
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

  return (
    <div className="mt-8 grid gap-6 xl:grid-cols-[1.25fr,0.9fr]">
      <section className="hc-panel-section p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="hc-badge hc-badge--telegram">
              <ShieldCheck size={16} />
              <span>Telegram Source Console</span>
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
            Telegram API is not configured on the backend yet. Add `TG_API_ID` and `TG_API_HASH` on the server and refresh.
          </div>
        )}

        <div className={`hc-meter mt-6 ${statusCopy.tone}`}>
          <span className={`h-2.5 w-2.5 rounded-full ${busyIndicator ? 'animate-pulse bg-current' : 'bg-current'}`} />
          <span>{statusCopy.title}</span>
        </div>

        {error && (
          <div className="mt-6 rounded-[24px] border border-red-400/20 bg-red-500/10 px-5 py-4 text-sm text-red-100">
            {error}
          </div>
        )}

        {(status === 'loggedOut' || status === 'phoneInput') && (
          <div className="hc-card mt-8 p-5">
            <label className="block text-sm text-white/55">Phone number</label>
            <input
              value={phone}
              onChange={(event) => onPhoneChange(event.target.value)}
              placeholder="+972501234567"
              className="hc-input mt-3 text-lg"
            />
            <button
              onClick={onStartLogin}
              disabled={busy || !phone.trim() || !configured}
              className="hc-button hc-button--telegram mt-5 px-6 py-3 text-sm"
            >
              <LogIn size={16} />
              <span>Send code</span>
            </button>
          </div>
        )}

        {status === 'codeInput' && (
          <div className="hc-card mt-8 p-5">
            <label className="block text-sm text-white/55">Verification code</label>
            <input
              value={code}
              onChange={(event) => onCodeChange(event.target.value)}
              placeholder="12345"
              className="hc-input mt-3 text-lg"
            />
            <button
              onClick={onSubmitCode}
              disabled={busy || !code.trim()}
              className="hc-button hc-button--telegram mt-5 px-6 py-3 text-sm"
            >
              Confirm code
            </button>
          </div>
        )}

        {status === 'passwordInput' && (
          <div className="hc-card mt-8 p-5">
            <label className="block text-sm text-white/55">Telegram 2FA password</label>
            <input
              value={password}
              onChange={(event) => onPasswordChange(event.target.value)}
              type="password"
              placeholder="Password"
              className="hc-input mt-3 text-lg"
            />
            <button
              onClick={onSubmitPassword}
              disabled={busy || !password.trim()}
              className="hc-button hc-button--magenta mt-5 px-6 py-3 text-sm"
            >
              Confirm password
            </button>
          </div>
        )}

        {status === 'loggedIn' && (
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
