import { safeGetJson, safeSetJson } from './safeStorage';

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export const PLAYBACK_CACHE_STORAGE_KEY = 'playback_cache_v1';
export const PREBUFFER_BYTES = 50 * 1024 * 1024;

export interface PlaybackCacheEntry {
  sourceKey: string;
  mediaKey: string;
  title: string;
  mediaType: string;
  peerId: string;
  messageId: number;
  streamUrl: string;
  downloadUrl: string;
  cachePath: string;
  cacheUri?: string;
  fileName?: string;
  mimeType?: string;
  fileSizeBytes: number;
  bytesDownloaded: number;
  durationSeconds: number;
  lastPositionSeconds: number;
  lastUpdatedAt: number;
  isComplete: boolean;
}

export type PlaybackCacheMap = Record<string, PlaybackCacheEntry>;

export const readPlaybackCacheMap = (storage: StorageLike) =>
  safeGetJson<PlaybackCacheMap>(storage, PLAYBACK_CACHE_STORAGE_KEY, {});

export const writePlaybackCacheMap = (storage: StorageLike, value: PlaybackCacheMap) =>
  safeSetJson(storage, PLAYBACK_CACHE_STORAGE_KEY, value);

export const getPrebufferTargetBytes = (fileSizeBytes?: number | null) => {
  if (!fileSizeBytes || fileSizeBytes <= 0) return PREBUFFER_BYTES;
  return Math.min(PREBUFFER_BYTES, fileSizeBytes);
};

export const upsertPlaybackCacheEntry = (
  current: PlaybackCacheMap,
  sourceKey: string,
  patch: Partial<PlaybackCacheEntry> & Pick<PlaybackCacheEntry, 'sourceKey' | 'mediaKey' | 'title' | 'mediaType' | 'peerId' | 'messageId' | 'streamUrl' | 'downloadUrl' | 'cachePath' | 'fileSizeBytes'>
) => ({
  ...current,
  [sourceKey]: {
    bytesDownloaded: 0,
    durationSeconds: 0,
    lastPositionSeconds: 0,
    isComplete: false,
    ...current[sourceKey],
    ...patch,
    lastUpdatedAt: patch.lastUpdatedAt ?? Date.now()
  }
});

export const removePlaybackCacheEntry = (current: PlaybackCacheMap, sourceKey: string) => {
  const next = { ...current };
  delete next[sourceKey];
  return next;
};

export const isPlayableFromCache = (entry: PlaybackCacheEntry | null | undefined) =>
  !!entry?.isComplete && !!entry.cacheUri;

export const shouldDeleteCompletedCache = (entry: PlaybackCacheEntry | null | undefined, watched: boolean) =>
  !!entry && watched;
