import {
  IN_PROGRESS_MIN_SECONDS,
  WATCHED_THRESHOLD,
  buildMediaKey,
  type MediaStateEntry
} from './mediaState';
import { normalizeCorridorItem, type CorridorItem } from './contentModel';

export type SearchSourceId = 'continue_watching' | 'favorites' | 'history' | 'catalog';

export type SearchSourceSummary = {
  id: SearchSourceId;
  label: string;
  count: number;
};

export type LibraryCollections = {
  favorites: CorridorItem[];
  history: CorridorItem[];
  continueWatching: CorridorItem[];
  searchPool: CorridorItem[];
  spotlight: CorridorItem[];
  sourceLookup: Map<string, SearchSourceId>;
  sourceSummaries: SearchSourceSummary[];
};

const SEARCH_SOURCE_LABELS: Record<SearchSourceId, string> = {
  continue_watching: 'המשך צפייה',
  favorites: 'מועדפים',
  history: 'היסטוריה',
  catalog: 'קטלוג'
};

const getCorridorIdentity = (item: Partial<CorridorItem>) =>
  buildMediaKey(item as Parameters<typeof buildMediaKey>[0])
  || `${item.mediaType || 'unknown'}:${item.id ?? item.title ?? 'unknown'}`;

const byRecentWatch = (left: MediaStateEntry, right: MediaStateEntry) =>
  (right.lastWatchedAt || 0) - (left.lastWatchedAt || 0)
  || left.snapshot.title.localeCompare(right.snapshot.title);

const dedupeCorridorItems = (items: CorridorItem[]) => {
  const seen = new Set<string>();
  const deduped: CorridorItem[] = [];

  items.forEach((item) => {
    const identity = getCorridorIdentity(item);
    if (seen.has(identity)) return;
    seen.add(identity);
    deduped.push(item);
  });

  return deduped;
};

const toCorridorItem = (entry: MediaStateEntry): CorridorItem | null =>
  normalizeCorridorItem(
    {
      ...entry.snapshot,
      posterThumb: entry.snapshot.poster
    },
    entry.snapshot.mediaType === 'episode'
      ? 'episode'
      : entry.snapshot.mediaType === 'season'
        ? 'season'
        : entry.snapshot.mediaType === 'tv'
          ? 'tv'
          : 'movie'
  );

const buildMediaCollection = (entries: MediaStateEntry[]) =>
  dedupeCorridorItems(
    entries
      .map((entry) => toCorridorItem(entry))
      .filter((item): item is CorridorItem => Boolean(item))
  );

const makeSummary = (id: SearchSourceId, count: number): SearchSourceSummary => ({
  id,
  label: SEARCH_SOURCE_LABELS[id],
  count
});

const addSourceItems = (
  lookup: Map<string, SearchSourceId>,
  items: CorridorItem[],
  source: SearchSourceId
) => {
  items.forEach((item) => {
    const identity = getCorridorIdentity(item);
    if (!lookup.has(identity)) {
      lookup.set(identity, source);
    }
  });
};

export const getSearchSourceLabel = (source: SearchSourceId) => SEARCH_SOURCE_LABELS[source];

export const classifySearchSource = (
  item: Partial<CorridorItem>,
  lookup: ReadonlyMap<string, SearchSourceId>
): SearchSourceId => lookup.get(getCorridorIdentity(item)) ?? 'catalog';

export const summarizeSearchResultsBySource = (
  items: CorridorItem[],
  lookup: ReadonlyMap<string, SearchSourceId>
) => {
  const counts = new Map<SearchSourceId, number>();

  items.forEach((item) => {
    const source = classifySearchSource(item, lookup);
    counts.set(source, (counts.get(source) ?? 0) + 1);
  });

  return ([
    'continue_watching',
    'favorites',
    'history',
    'catalog'
  ] as SearchSourceId[])
    .map((source) => makeSummary(source, counts.get(source) ?? 0))
    .filter((summary) => summary.count > 0);
};

export const deriveLibraryCollections = ({
  mediaStateMap,
  catalogItems
}: {
  mediaStateMap: Record<string, MediaStateEntry>;
  catalogItems: CorridorItem[];
}): LibraryCollections => {
  const entries = Object.values(mediaStateMap);

  const favoriteEntries = [...entries]
    .filter((entry) => entry.favorite)
    .sort(byRecentWatch);

  const historyEntries = [...entries]
    .filter((entry) => Boolean(entry.lastWatchedAt))
    .sort(byRecentWatch);

  const continueWatchingEntries = historyEntries.filter((entry) => (
    entry.watchStatus === 'in_progress'
    && entry.progressPercent > 0
    && entry.progressPercent < WATCHED_THRESHOLD
    && (entry.progressSeconds >= IN_PROGRESS_MIN_SECONDS || entry.progressPercent >= 0.05)
  ));

  const favorites = buildMediaCollection(favoriteEntries);
  const history = buildMediaCollection(historyEntries);
  const continueWatching = buildMediaCollection(continueWatchingEntries);
  const catalog = dedupeCorridorItems(catalogItems).slice(0, 180);

  const searchPool = dedupeCorridorItems([
    ...continueWatching,
    ...favorites,
    ...history,
    ...catalog
  ]);

  const spotlight = dedupeCorridorItems([
    ...continueWatching.slice(0, 6),
    ...favorites.slice(0, 4),
    ...history.slice(0, 4)
  ]).slice(0, 8);

  const sourceLookup = new Map<string, SearchSourceId>();
  addSourceItems(sourceLookup, continueWatching, 'continue_watching');
  addSourceItems(sourceLookup, favorites, 'favorites');
  addSourceItems(sourceLookup, history, 'history');
  addSourceItems(sourceLookup, catalog, 'catalog');

  return {
    favorites,
    history,
    continueWatching,
    searchPool,
    spotlight,
    sourceLookup,
    sourceSummaries: [
      makeSummary('continue_watching', continueWatching.length),
      makeSummary('favorites', favorites.length),
      makeSummary('history', history.length),
      makeSummary('catalog', catalog.length)
    ].filter((summary) => summary.count > 0)
  };
};
