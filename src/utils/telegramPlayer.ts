import { buildMediaKey, type MediaStateEntry } from './mediaState';
import { buildPlaybackSourceKey } from './sourceKey';
import type { CorridorItem } from './contentModel';

export type TelegramAuthStatus =
  | 'checking'
  | 'loggedOut'
  | 'phoneInput'
  | 'codeInput'
  | 'passwordInput'
  | 'loggedIn';

export type TelegramSearchResult = {
  id: number;
  peerId: string;
  title: string;
  chatName?: string;
  date?: number;
  size?: string;
  sizeBytes?: number;
  fileName?: string;
  mimeType?: string;
  durationSeconds?: number;
};

export type TelegramSubtitleResult = {
  id: number;
  peerId: string;
  title: string;
  subtitleUrl: string;
};

export type TelegramSourceInfo = {
  sourceKey?: string;
  fileName?: string;
  fileSizeBytes?: number;
  mimeType?: string;
  durationSeconds?: number;
  streamUrl?: string;
  downloadUrl?: string;
};

export type PreparedPlayback = {
  title: string;
  subtitleUrl?: string;
  mediaItem: CorridorItem;
  sourceKey: string;
  streamUrl: string;
  downloadUrl: string;
  fileSizeBytes: number;
  mimeType?: string;
  fileName?: string;
  durationSeconds: number;
  cachePath: string;
  cacheUri?: string;
  resumePositionSeconds: number;
  peerId: string;
  messageId: number;
};

export const isPlayableMediaItem = (item: CorridorItem | null | undefined) =>
  !!item && (item.mediaType === 'movie' || item.mediaType === 'episode');

const sanitizeQueryPart = (value: string | undefined) =>
  String(value || '')
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const buildTelegramSearchQuery = (item: CorridorItem | null | undefined) => {
  if (!item) return '';

  const baseTitle = sanitizeQueryPart(item.title);
  const originalTitle = sanitizeQueryPart(item.originalTitle);
  const localizedTitle = sanitizeQueryPart(item.localizedTitle);
  const seriesTitle = sanitizeQueryPart(item.seriesTitle);

  if (item.mediaType === 'episode') {
    const episodeTag = item.seasonNum && item.episode_number
      ? `S${String(item.seasonNum).padStart(2, '0')}E${String(item.episode_number).padStart(2, '0')}`
      : '';
    return [seriesTitle || originalTitle, episodeTag, baseTitle].filter(Boolean).join(' ');
  }

  if (item.mediaType === 'movie') {
    return [localizedTitle || originalTitle || baseTitle, item.year].filter(Boolean).join(' ');
  }

  return [localizedTitle || originalTitle || baseTitle, item.year].filter(Boolean).join(' ');
};

export const buildSubtitleSearchQuery = (item: CorridorItem | null | undefined) => {
  if (!item) return '';
  if (item.mediaType === 'episode') {
    return [sanitizeQueryPart(item.seriesTitle), item.seasonNum ? `season ${item.seasonNum}` : '', item.episode_number ? `episode ${item.episode_number}` : '']
      .filter(Boolean)
      .join(' ');
  }
  return [sanitizeQueryPart(item.localizedTitle || item.originalTitle || item.title), item.year].filter(Boolean).join(' ');
};

export const getResumePositionSeconds = (
  item: CorridorItem,
  mediaStateMap: Record<string, MediaStateEntry>
) => mediaStateMap[buildMediaKey(item)]?.progressSeconds ?? 0;

export const pickDefaultSubtitle = (results: TelegramSubtitleResult[]) => results[0]?.subtitleUrl;

export const buildPreparedPlayback = ({
  apiBase,
  mediaItem,
  source,
  sourceInfo,
  subtitleUrl,
  resumePositionSeconds
}: {
  apiBase: string;
  mediaItem: CorridorItem;
  source: TelegramSearchResult;
  sourceInfo: TelegramSourceInfo;
  subtitleUrl?: string;
  resumePositionSeconds: number;
}): PreparedPlayback => {
  const sourceKey = buildPlaybackSourceKey({
    mediaKey: buildMediaKey(mediaItem),
    peerId: source.peerId,
    messageId: source.id,
    fileName: sourceInfo.fileName || source.fileName,
    fileSizeBytes: sourceInfo.fileSizeBytes ?? source.sizeBytes,
    mimeType: sourceInfo.mimeType || source.mimeType
  });

  const streamUrl = new URL(sourceInfo.streamUrl || '', apiBase).toString();
  const downloadUrl = new URL(sourceInfo.downloadUrl || sourceInfo.streamUrl || '', apiBase).toString();
  const absoluteSubtitleUrl = subtitleUrl ? new URL(subtitleUrl, apiBase).toString() : undefined;
  const title = mediaItem.mediaType === 'episode' && mediaItem.seriesTitle
    ? `${mediaItem.seriesTitle} - ${mediaItem.title}`
    : mediaItem.title;

  return {
    title,
    subtitleUrl: absoluteSubtitleUrl,
    mediaItem,
    sourceKey,
    streamUrl,
    downloadUrl,
    fileSizeBytes: sourceInfo.fileSizeBytes ?? source.sizeBytes ?? 0,
    mimeType: sourceInfo.mimeType || source.mimeType,
    fileName: sourceInfo.fileName || source.fileName,
    durationSeconds: sourceInfo.durationSeconds ?? source.durationSeconds ?? 0,
    cachePath: `telegram/${sourceKey}`,
    resumePositionSeconds: Math.max(0, resumePositionSeconds),
    peerId: source.peerId,
    messageId: source.id
  };
};
