export interface PlaybackSourceIdentityInput {
  mediaKey: string;
  peerId: string;
  messageId: number | string;
  fileName?: string | null;
  fileSizeBytes?: number | null;
  mimeType?: string | null;
}

const hashString = (value: string) => {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
};

export const buildPlaybackSourceKey = (input: PlaybackSourceIdentityInput) => {
  const normalized = [
    input.mediaKey,
    input.peerId,
    String(input.messageId),
    input.fileName || '',
    input.fileSizeBytes || 0,
    input.mimeType || ''
  ].join('|');

  return `src_${hashString(normalized)}`;
};
