export type FeedTarget = 'movies' | 'series' | 'israeli';
export type CatalogMediaType = 'movie' | 'tv';
export type ContentMediaType = CatalogMediaType | 'season' | 'episode';

export type CorridorItem = {
  id: number | string;
  title: string;
  localizedTitle?: string;
  originalTitle?: string;
  genre?: string;
  rating?: number;
  popularity?: number;
  poster: string;
  posterThumb?: string;
  desc?: string;
  mediaType: ContentMediaType;
  year?: number | null;
  language?: string;
  seriesId?: number;
  seriesTitle?: string;
  seasonNum?: number;
  season_number?: number;
  seasonTitle?: string;
  episode_number?: number;
  episode_count?: number;
  alternateTitles?: string[];
  uniqueId?: string;
};

export type CatalogPageResult = {
  items: CorridorItem[];
  hasMore: boolean;
  fromCache?: boolean;
};

export type SeasonsNavContext = {
  type: 'seasons';
  seriesId: number;
  seriesTitle: string;
  seasons: CorridorItem[];
};

export type EpisodesNavContext = {
  type: 'episodes';
  seriesId: number;
  seasonNum: number;
  seriesTitle: string;
  seasonTitle: string;
  episodes: CorridorItem[];
};

export type NavContext = SeasonsNavContext | EpisodesNavContext | null;

const parseYear = (value: unknown): number | null => {
  const match = String(value ?? '').match(/\d{4}/);
  return match ? Number.parseInt(match[0], 10) : null;
};

const asNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const asOptionalPositiveInt = (value: unknown): number | undefined => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};

export const getCatalogFallbackMediaType = (target: FeedTarget): CatalogMediaType =>
  target === 'series' ? 'tv' : 'movie';

export const coerceContentMediaType = (
  value: unknown,
  fallbackMediaType: ContentMediaType
): ContentMediaType => {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'movie') return 'movie';
  if (normalized === 'tv' || normalized === 'series' || normalized === 'show') return 'tv';
  if (normalized === 'season') return 'season';
  if (normalized === 'episode') return 'episode';
  return fallbackMediaType;
};

export const normalizeContentItem = (
  item: any,
  fallbackMediaType: ContentMediaType
): CorridorItem | null => {
  if (!item || (item.id === undefined && !item.title && !item.localizedTitle && !item.originalTitle)) {
    return null;
  }

  const poster = String(item.poster || item.posterThumb || item.image?.original || item.image?.medium || '').trim();
  if (!poster) return null;

  const mediaType = coerceContentMediaType(item.mediaType, fallbackMediaType);
  const seasonNumber = asOptionalPositiveInt(item.seasonNum ?? item.season_number);
  const episodeNumber = asOptionalPositiveInt(item.episode_number);
  const episodeCount = asOptionalPositiveInt(item.episode_count);
  const seriesId = asOptionalPositiveInt(item.seriesId);

  const derivedTitle = mediaType === 'season' && seasonNumber
    ? `Season ${seasonNumber}`
    : mediaType === 'episode' && episodeNumber
      ? `Episode ${episodeNumber}`
      : '';
  const title = String(item.title || item.localizedTitle || item.originalTitle || derivedTitle).trim();
  if (!title) return null;

  const year = parseYear(item.year || item.releaseYear || item.release_date || item.first_air_date || item.premiered || item.airdate);
  return {
    ...item,
    id: item.id ?? `${mediaType}:${title}:${year ?? 'na'}`,
    title,
    localizedTitle: String(item.localizedTitle || title),
    originalTitle: String(item.originalTitle || title),
    genre: String(item.genre || ''),
    rating: asNumber(item.rating ?? item.vote_average),
    popularity: asNumber(item.popularity ?? item.weight),
    poster,
    posterThumb: String(item.posterThumb || poster),
    desc: String(item.desc || item.overview || ''),
    mediaType,
    year,
    language: String(item.language || item.original_language || ''),
    seriesId,
    seriesTitle: item.seriesTitle ? String(item.seriesTitle) : undefined,
    seasonNum: seasonNumber,
    season_number: seasonNumber,
    seasonTitle: item.seasonTitle ? String(item.seasonTitle) : undefined,
    episode_number: episodeNumber,
    episode_count: episodeCount,
    alternateTitles: Array.isArray(item.alternateTitles)
      ? item.alternateTitles.map((entry: unknown) => String(entry).trim()).filter(Boolean)
      : undefined
  };
};

export const normalizeCorridorItem = normalizeContentItem;

export const normalizeCatalogPage = (
  items: any[],
  fallbackMediaType: CatalogMediaType
): CorridorItem[] => (Array.isArray(items) ? items : [])
  .map((item) => normalizeContentItem(item, fallbackMediaType))
  .filter((item): item is CorridorItem => Boolean(item));

export const normalizeSeasonPage = (
  items: any[],
  context: { seriesId: number; seriesTitle: string }
): CorridorItem[] => (Array.isArray(items) ? items : [])
  .map((item) => normalizeContentItem({
    ...item,
    mediaType: 'season',
    seriesId: item?.seriesId ?? context.seriesId,
    seriesTitle: item?.seriesTitle ?? context.seriesTitle,
    seasonNum: item?.seasonNum ?? item?.season_number
  }, 'season'))
  .filter((item): item is CorridorItem => Boolean(item));

export const normalizeEpisodePage = (
  items: any[],
  context: { seriesId: number; seriesTitle: string; seasonNum: number; seasonTitle: string }
): CorridorItem[] => (Array.isArray(items) ? items : [])
  .map((item) => normalizeContentItem({
    ...item,
    mediaType: 'episode',
    seriesId: item?.seriesId ?? context.seriesId,
    seriesTitle: item?.seriesTitle ?? context.seriesTitle,
    seasonNum: item?.seasonNum ?? item?.season_number ?? context.seasonNum,
    seasonTitle: item?.seasonTitle ?? context.seasonTitle
  }, 'episode'))
  .filter((item): item is CorridorItem => Boolean(item));

export const normalizeCatalogResponse = (
  response: any,
  target: FeedTarget
): CatalogPageResult => {
  const rawItems = target === 'movies'
    ? response?.movies
    : target === 'series'
      ? response?.series
      : response?.items;

  return {
    items: normalizeCatalogPage(rawItems, getCatalogFallbackMediaType(target)),
    hasMore: Boolean(response?.hasMore)
  };
};

export const mergeCorridorItems = (existing: CorridorItem[], incoming: CorridorItem[]) => {
  const next = new Map<string, CorridorItem>();
  [...existing, ...incoming].forEach((item) => {
    next.set(`${item.mediaType || 'unknown'}:${item.id}`, item);
  });
  return Array.from(next.values());
};

const buildFallbackItem = (item: CorridorItem): CorridorItem => ({
  ...item,
  localizedTitle: item.localizedTitle ?? item.title,
  originalTitle: item.originalTitle ?? item.title,
  posterThumb: item.posterThumb ?? item.poster,
  desc: item.desc ?? '',
  rating: item.rating ?? 0,
  popularity: item.popularity ?? 0,
  language: item.language ?? 'en'
});

export const FALLBACK_LIBRARY: Record<FeedTarget, CorridorItem[]> = {
  movies: [
    buildFallbackItem({ id: 27205, title: 'Inception', genre: 'Sci-Fi', rating: 8.8, popularity: 95, poster: 'https://image.tmdb.org/t/p/w500/8Z8dpt8NqCvxu4XTEcXCFCISCE0.jpg', desc: 'A dream-infiltration heist bends reality in every corridor.', mediaType: 'movie', year: 2010 }),
    buildFallbackItem({ id: 157336, title: 'Interstellar', genre: 'Sci-Fi', rating: 8.6, popularity: 94, poster: 'https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MvrIdlsR.jpg', desc: 'Explorers cross a wormhole to save humanity from collapse.', mediaType: 'movie', year: 2014 }),
    buildFallbackItem({ id: 155, title: 'The Dark Knight', genre: 'Action', rating: 9.0, popularity: 98, poster: 'https://image.tmdb.org/t/p/w500/qJ2tW6WMUDux911r6m7haRef0WH.jpg', desc: 'Batman faces chaos itself in Gotham City.', mediaType: 'movie', year: 2008 }),
    buildFallbackItem({ id: 438631, title: 'Dune', genre: 'Sci-Fi', rating: 8.0, popularity: 90, poster: 'https://image.tmdb.org/t/p/w500/d5NXSklXo0qyIYkgV94XAgMIckC.jpg', desc: 'A noble heir is thrust into a deadly battle for Arrakis.', mediaType: 'movie', year: 2021 }),
    buildFallbackItem({ id: 76341, title: 'Mad Max: Fury Road', genre: 'Action', rating: 8.1, popularity: 92, poster: 'https://image.tmdb.org/t/p/w500/hA2ple9q4qnwxp3hKVNhroipsir.jpg', desc: 'A relentless high-octane escape through a brutal wasteland.', mediaType: 'movie', year: 2015 }),
    buildFallbackItem({ id: 335984, title: 'Blade Runner 2049', genre: 'Sci-Fi', rating: 8.0, popularity: 88, poster: 'https://image.tmdb.org/t/p/w500/gajva2L0rPYkEWjzgFlBXCAVBE5.jpg', desc: 'A new blade runner uncovers a secret that could change the world.', mediaType: 'movie', year: 2017 }),
    buildFallbackItem({ id: 324857, title: 'Spider-Man: Into the Spider-Verse', genre: 'Animation', rating: 8.4, popularity: 89, poster: 'https://image.tmdb.org/t/p/w500/iiZZdoQBEYBv6id8su7ImL0oCbD.jpg', desc: 'Miles Morales discovers a multiverse of Spider-heroes.', mediaType: 'movie', year: 2018 }),
    buildFallbackItem({ id: 545611, title: 'Everything Everywhere All at Once', genre: 'Adventure', rating: 8.2, popularity: 87, poster: 'https://image.tmdb.org/t/p/w500/w3LxiVYdWWRvEVdn5RYq6jIqkb1.jpg', desc: 'A family crisis spirals into a multiverse showdown.', mediaType: 'movie', year: 2022 }),
    buildFallbackItem({ id: 13, title: 'The Matrix', genre: 'Sci-Fi', rating: 8.7, popularity: 93, poster: 'https://image.tmdb.org/t/p/w500/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg', desc: 'A hacker learns the truth behind reality.', mediaType: 'movie', year: 1999 }),
    buildFallbackItem({ id: 680, title: 'Pulp Fiction', genre: 'Crime', rating: 8.9, popularity: 84, poster: 'https://image.tmdb.org/t/p/w500/d5iIlFn5s0ImszYzBPb8JPIfbXD.jpg', desc: 'Intersecting crime stories unfold over one iconic weekend.', mediaType: 'movie', year: 1994 })
  ],
  series: [
    buildFallbackItem({ id: 1396, title: 'Breaking Bad', genre: 'Drama', rating: 9.5, popularity: 97, poster: 'https://image.tmdb.org/t/p/w500/ztkUQFLlC19CCMYHW9o1zWhJRNq.jpg', desc: 'A chemistry teacher transforms into a drug kingpin.', mediaType: 'tv', year: 2008 }),
    buildFallbackItem({ id: 60059, title: 'Better Call Saul', genre: 'Drama', rating: 8.9, popularity: 90, poster: 'https://image.tmdb.org/t/p/w500/fC2HDm5t0kHl7Mzh9rhXc32G7DG.jpg', desc: 'The rise of Jimmy McGill before he becomes Saul Goodman.', mediaType: 'tv', year: 2015 }),
    buildFallbackItem({ id: 66732, title: 'Stranger Things', genre: 'Sci-Fi', rating: 8.7, popularity: 95, poster: 'https://image.tmdb.org/t/p/w500/49WJfeN0moxb9IPfGn8AIqMGskD.jpg', desc: 'A small town uncovers a terrifying alternate dimension.', mediaType: 'tv', year: 2016 }),
    buildFallbackItem({ id: 70523, title: 'Dark', genre: 'Mystery', rating: 8.8, popularity: 85, poster: 'https://image.tmdb.org/t/p/w500/5LoVkW3zU6jVHiw82qAtfKgnYDj.jpg', desc: 'A missing child reveals a web of time-travel secrets.', mediaType: 'tv', year: 2017 }),
    buildFallbackItem({ id: 95396, title: 'Severance', genre: 'Thriller', rating: 8.6, popularity: 83, poster: 'https://image.tmdb.org/t/p/w500/jcEl8SISNfGdlQFwLzeEtsjDvpw.jpg', desc: 'Office workers undergo a procedure that splits work from self.', mediaType: 'tv', year: 2022 }),
    buildFallbackItem({ id: 100088, title: 'The Last of Us', genre: 'Drama', rating: 8.8, popularity: 92, poster: 'https://image.tmdb.org/t/p/w500/uKvVjHNqB5VmOrdxqAt2F7J78ED.jpg', desc: 'A hardened survivor escorts a girl across a collapsed world.', mediaType: 'tv', year: 2023 })
  ],
  israeli: [
    buildFallbackItem({ id: 62852, title: 'Fauda', genre: 'Action', rating: 8.2, popularity: 73, poster: 'https://picsum.photos/seed/fauda/500/750', desc: 'An undercover team navigates escalating conflict and loyalty.', mediaType: 'tv', year: 2015, language: 'he' }),
    buildFallbackItem({ id: 72673, title: 'Shtisel', genre: 'Drama', rating: 8.5, popularity: 66, poster: 'https://picsum.photos/seed/shtisel/500/750', desc: 'An intimate portrait of family and tradition in Jerusalem.', mediaType: 'tv', year: 2013, language: 'he' }),
    buildFallbackItem({ id: 130965, title: 'Tehran', genre: 'Thriller', rating: 7.5, popularity: 69, poster: 'https://picsum.photos/seed/tehran/500/750', desc: 'An Israeli agent goes undercover in a hostile capital.', mediaType: 'tv', year: 2020, language: 'he' }),
    buildFallbackItem({ id: 888, title: 'Waltz with Bashir', genre: 'Animation', rating: 8.0, popularity: 61, poster: 'https://picsum.photos/seed/bashir/500/750', desc: 'A veteran reconstructs lost memories from war.', mediaType: 'movie', year: 2008, language: 'he' }),
    buildFallbackItem({ id: 4122, title: 'Beaufort', genre: 'War', rating: 7.0, popularity: 52, poster: 'https://picsum.photos/seed/beaufort/500/750', desc: 'Soldiers endure the final days of an isolated outpost.', mediaType: 'movie', year: 2007, language: 'he' })
  ]
};
