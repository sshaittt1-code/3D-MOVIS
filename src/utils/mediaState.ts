export type WatchStatus = 'unwatched' | 'in_progress' | 'watched';

export interface MediaSnapshot {
  id: number | string;
  mediaType: string;
  title: string;
  localizedTitle?: string;
  originalTitle?: string;
  seriesTitle?: string;
  genre?: string;
  poster?: string;
  posterThumb?: string;
  desc?: string;
  year?: number | null;
  language?: string;
  peerId?: string;
  username?: string;
  telegramType?: 'group' | 'channel';
  unreadCount?: number;
  memberCount?: number;
  seriesId?: number;
  seasonNum?: number;
  season_number?: number;
  episode_number?: number;
}

export interface MediaStateEntry {
  key: string;
  snapshot: MediaSnapshot;
  favorite: boolean;
  watchStatus: WatchStatus;
  progressSeconds: number;
  durationSeconds: number;
  progressPercent: number;
  lastWatchedAt: number | null;
}

export const MEDIA_STATE_STORAGE_KEY = 'media_state_v1';
export const AUTOPLAY_STORAGE_KEY = 'auto_play_next_episode_v1';
export const WATCHED_THRESHOLD = 0.92;
export const IN_PROGRESS_MIN_SECONDS = 30;

export const buildMediaKey = (item: Partial<MediaSnapshot> | null | undefined) => {
  if (!item?.mediaType || item.id === undefined || item.id === null) return '';
  return [
    item.mediaType,
    item.id,
    item.seriesId ?? '',
    item.seasonNum ?? item.season_number ?? '',
    item.episode_number ?? ''
  ].join(':');
};

export const createMediaSnapshot = (item: any): MediaSnapshot => ({
  id: item.id,
  mediaType: item.mediaType,
  title: item.title,
  localizedTitle: item.localizedTitle,
  originalTitle: item.originalTitle,
  seriesTitle: item.seriesTitle,
  genre: item.genre,
  poster: item.poster,
  posterThumb: item.posterThumb,
  desc: item.desc,
  year: item.year,
  language: item.language,
  peerId: item.peerId,
  username: item.username,
  telegramType: item.telegramType,
  unreadCount: item.unreadCount,
  memberCount: item.memberCount,
  seriesId: item.seriesId,
  seasonNum: item.seasonNum ?? item.season_number,
  season_number: item.season_number,
  episode_number: item.episode_number
});

export const deriveWatchStatus = (
  progressSeconds: number,
  durationSeconds: number,
  progressPercent?: number
): WatchStatus => {
  const safeProgress = Math.max(0, progressSeconds || 0);
  const safeDuration = Math.max(0, durationSeconds || 0);
  const safePercent = progressPercent ?? (safeDuration > 0 ? safeProgress / safeDuration : 0);

  if (safeDuration > 0 && safePercent >= WATCHED_THRESHOLD) return 'watched';
  if (safeProgress >= IN_PROGRESS_MIN_SECONDS || safePercent >= 0.05) return 'in_progress';
  return 'unwatched';
};

export const createDefaultMediaStateEntry = (item: any): MediaStateEntry => ({
  key: buildMediaKey(item),
  snapshot: createMediaSnapshot(item),
  favorite: false,
  watchStatus: 'unwatched',
  progressSeconds: 0,
  durationSeconds: 0,
  progressPercent: 0,
  lastWatchedAt: null
});

export const updateProgressState = (
  item: any,
  current: MediaStateEntry | undefined,
  progressSeconds: number,
  durationSeconds: number
): MediaStateEntry => {
  const base = current ?? createDefaultMediaStateEntry(item);
  const progressPercent = durationSeconds > 0 ? Math.max(0, Math.min(1, progressSeconds / durationSeconds)) : 0;
  const watchStatus = deriveWatchStatus(progressSeconds, durationSeconds, progressPercent);

  return {
    ...base,
    snapshot: createMediaSnapshot(item),
    progressSeconds,
    durationSeconds,
    progressPercent,
    watchStatus,
    lastWatchedAt: watchStatus === 'unwatched' ? base.lastWatchedAt : Date.now()
  };
};

export const migrateLegacyMediaState = (favorites: any[], history: any[]) => {
  const entries: Record<string, MediaStateEntry> = {};

  favorites.forEach((item) => {
    const entry = createDefaultMediaStateEntry(item);
    entries[entry.key] = { ...entry, favorite: true };
  });

  history.forEach((item) => {
    const key = buildMediaKey(item);
    const previous = entries[key] ?? createDefaultMediaStateEntry(item);
    entries[key] = {
      ...previous,
      snapshot: createMediaSnapshot(item),
      lastWatchedAt: item.watchedAt || Date.now(),
      watchStatus: item.watchStatus || 'watched',
      progressSeconds: item.progressSeconds || 0,
      durationSeconds: item.durationSeconds || 0,
      progressPercent: item.progressPercent || (item.watchStatus === 'watched' ? 1 : 0)
    };
  });

  return entries;
};
