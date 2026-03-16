import React from 'react';
import { Loader2, LogOut, Play, RefreshCw, ShieldCheck, Subtitles } from 'lucide-react';
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
  searchQuery: string;
  sources: TelegramSearchResult[];
  subtitles: TelegramSubtitleResult[];
  selectedSubtitleUrl: string | null;
  onSearchQueryChange: (value: string) => void;
  onSelectedSubtitleChange: (value: string | null) => void;
  onRefreshStatus: () => void;
  onLogout: () => void;
  onSearchSources: () => void;
  onSearchSubtitles: () => void;
  onPlaySource: (source: TelegramSearchResult) => void;
  formatBytes: (bytes: number) => string;
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
  searchQuery,
  sources,
  subtitles,
  selectedSubtitleUrl,
  onSearchQueryChange,
  onSelectedSubtitleChange,
  onRefreshStatus,
  onLogout,
  onSearchSources,
  onSearchSubtitles,
  onPlaySource,
  formatBytes
}: TelegramConsolePanelProps) => {
  const isLoggedIn = status === 'loggedIn';
  const playableSelection = isPlayableSelection(currentItem);

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
            כדי להשתמש בטלגרם צריך להגדיר בשרת את <code>TG_API_ID</code> ואת <code>TG_API_HASH</code>.
          </p>
        </div>
      </section>
    );
  }

  if (!isLoggedIn) {
    return (
      <section className="hc-panel-section mt-8 p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="hc-badge hc-badge--telegram">
              <ShieldCheck size={16} />
              <span>חיבור טלגרם</span>
            </div>
            <h3 className="mt-4 text-3xl font-semibold text-white">החשבון לא מחובר כרגע</h3>
            <p className="hc-subtitle mt-3 max-w-2xl text-base">
              כדי להתחבר, פתח את קטגוריית טלגרם בתפריט הראשי. שם ייפתח wizard קצר של טלפון, קוד אימות, ואם צריך גם אימות דו שלבי.
            </p>
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

        {error && (
          <div className="mt-6 rounded-[24px] border border-red-400/20 bg-red-500/10 px-5 py-4 text-sm text-red-100">
            {error}
          </div>
        )}
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
                  {sourceSearchBusy ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
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
