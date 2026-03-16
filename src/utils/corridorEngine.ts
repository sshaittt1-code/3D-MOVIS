import { buildMediaKey } from './mediaState';

export const CORRIDOR_INITIAL_CAMERA_Z = 2;
export const CORRIDOR_POSTER_PAIR_SPACING = 5;
export const CORRIDOR_POSTER_X_OFFSET = 4.9;
export const CORRIDOR_POSTER_Y = 3.2;
export const CORRIDOR_RENDER_BEHIND = 6;

export type CorridorRenderableItem = {
  id?: number | string;
  mediaType?: string;
  title?: string;
};

export type CorridorRenderItem<T = CorridorRenderableItem> = T & {
  uniqueId: string;
};

export type CorridorLayoutEntry<T = CorridorRenderableItem> = {
  movie: CorridorRenderItem<T>;
  position: [number, number, number];
  rotation: [number, number, number];
};

export type CorridorPosterTransform = Pick<CorridorLayoutEntry, 'position' | 'rotation'>;

const buildCorridorBaseKey = (item: CorridorRenderableItem, fallbackIndex: number) => {
  const mediaKey = buildMediaKey(item as Parameters<typeof buildMediaKey>[0]);
  if (mediaKey) return mediaKey;
  const fallbackId = item.id ?? item.title ?? fallbackIndex;
  return `${item.mediaType || 'unknown'}:${fallbackId}`;
};

export const decorateCorridorItems = <T extends CorridorRenderableItem>(
  items: T[],
  scopeKey: string
): Array<CorridorRenderItem<T>> => {
  const duplicateCounts = new Map<string, number>();
  return items.map((item, index) => {
    const baseKey = buildCorridorBaseKey(item, index);
    const duplicateIndex = duplicateCounts.get(baseKey) ?? 0;
    duplicateCounts.set(baseKey, duplicateIndex + 1);
    const suffix = duplicateIndex > 0 ? `:${duplicateIndex}` : '';
    return {
      ...item,
      uniqueId: `${scopeKey}:${baseKey}${suffix}`
    };
  });
};

export const getPosterTransformForIndex = (index: number): CorridorPosterTransform => {
  const zIndex = Math.floor(index / 2);
  const isLeft = index % 2 === 0;
  return {
    position: [
      isLeft ? -CORRIDOR_POSTER_X_OFFSET : CORRIDOR_POSTER_X_OFFSET,
      CORRIDOR_POSTER_Y,
      -zIndex * CORRIDOR_POSTER_PAIR_SPACING - CORRIDOR_INITIAL_CAMERA_Z
    ],
    rotation: [0, isLeft ? Math.PI / 2.2 : -Math.PI / 2.2, 0]
  };
};

export const buildPosterLayout = <T extends CorridorRenderableItem>(
  items: Array<CorridorRenderItem<T>>
): Array<CorridorLayoutEntry<T>> => items.map((movie, index) => ({
  movie,
  ...getPosterTransformForIndex(index)
}));

export const getCorridorCurrentIndex = (cameraZ: number) =>
  Math.max(0, Math.floor((CORRIDOR_INITIAL_CAMERA_Z - cameraZ) / CORRIDOR_POSTER_PAIR_SPACING) * 2);

export const getRenderedPosterLayout = <T extends CorridorRenderableItem>(
  layout: Array<CorridorLayoutEntry<T>>,
  cameraZ: number,
  aheadCount: number
) => {
  const currentIdx = getCorridorCurrentIndex(cameraZ);
  return layout.slice(Math.max(0, currentIdx - CORRIDOR_RENDER_BEHIND), currentIdx + aheadCount);
};

export const getCorridorRenderAheadCount = (posterBatchSize: number) =>
  Math.max(20, Math.min(32, posterBatchSize + 6));

export const getLastPosterZ = <T extends CorridorRenderableItem>(layout: Array<CorridorLayoutEntry<T>>) =>
  layout.length > 0 ? layout[layout.length - 1].position[2] : -CORRIDOR_INITIAL_CAMERA_Z;

export const getNearEndTriggerZ = (lastPosterZ: number | undefined, thresholdRatio = 0.75) => {
  if (lastPosterZ === undefined || lastPosterZ >= CORRIDOR_INITIAL_CAMERA_Z) return null;
  return CORRIDOR_INITIAL_CAMERA_Z + (lastPosterZ - CORRIDOR_INITIAL_CAMERA_Z) * thresholdRatio;
};
