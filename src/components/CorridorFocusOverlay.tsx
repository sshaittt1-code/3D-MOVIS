import React from 'react';
import type { CorridorItem } from '../utils/contentModel';
import type { WatchStatus } from '../utils/mediaState';

type CorridorFocusOverlayProps = {
  item: CorridorItem | null;
  isFavorited: boolean;
  watchStatus: WatchStatus;
};

const WATCH_STATUS_LABEL: Record<WatchStatus, string | null> = {
  unwatched: null,
  in_progress: 'בתהליך צפייה',
  watched: 'נצפה'
};

const MEDIA_LABELS: Record<string, string> = {
  movie: 'סרט',
  tv: 'סדרה',
  season: 'עונה',
  episode: 'פרק'
};

export const CorridorFocusOverlay = ({
  item,
  isFavorited,
  watchStatus
}: CorridorFocusOverlayProps) => {
  if (!item) return null;

  const eyebrow = MEDIA_LABELS[item.mediaType] ?? 'קטלוג';
  const metadata = [item.genre, item.year].filter(Boolean).join(' · ');
  const watchLabel = WATCH_STATUS_LABEL[watchStatus];

  return (
    <div className="hc-tv-safe-right hc-tv-safe-y pointer-events-none absolute inset-x-0 bottom-0 z-30 flex justify-end">
      <div className="w-full max-w-[36rem] rounded-[34px] border border-[#7debd6]/16 bg-[linear-gradient(180deg,rgba(3,10,14,0.82),rgba(2,6,10,0.72))] px-6 py-5 shadow-[0_0_42px_rgba(0,0,0,0.45)] backdrop-blur-xl">
        <div className="text-[11px] uppercase tracking-[0.34em] text-[#7debd6]">{eyebrow}</div>
        <div className="mt-2 text-3xl font-semibold text-white">{item.localizedTitle || item.title}</div>
        {metadata && (
          <div className="mt-2 text-sm text-white/55">{metadata}</div>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-white/80">
          {typeof item.rating === 'number' && item.rating > 0 && (
            <div className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2">
              IMDb {item.rating.toFixed(1)}
            </div>
          )}
          {isFavorited && (
            <div className="rounded-full border border-rose-400/25 bg-rose-500/12 px-4 py-2 text-rose-100">
              במועדפים
            </div>
          )}
          {watchLabel && (
            <div className="rounded-full border border-amber-400/25 bg-amber-500/12 px-4 py-2 text-amber-100">
              {watchLabel}
            </div>
          )}
        </div>
        <div className="mt-4 flex flex-wrap gap-3 text-xs text-white/45">
          <div className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2">OK לפתיחה</div>
          <div className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2">לחיצה ארוכה לאפשרויות</div>
          <div className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2">Back לסרגל הראשי</div>
        </div>
      </div>
    </div>
  );
};
