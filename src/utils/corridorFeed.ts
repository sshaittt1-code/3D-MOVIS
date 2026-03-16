import type { LibrarySection, YearFilter } from './catalog';
import type { FeedCategory, MenuRoute } from './menuConfig';
import type { FeedTarget } from './contentModel';

export {
  FALLBACK_LIBRARY,
  getCatalogFallbackMediaType,
  mergeCorridorItems,
  normalizeCatalogPage,
  normalizeCatalogResponse,
  normalizeCorridorItem,
  type CatalogPageResult,
  type CorridorItem,
  type FeedTarget
} from './contentModel';

type RootRouteState = {
  librarySection: LibrarySection;
  movieCategory?: FeedCategory;
  seriesCategory?: FeedCategory;
  israeliCategory?: FeedCategory;
  movieGenreId: number | null;
  seriesGenreFilter: string | null;
  yearFilter: YearFilter;
  refreshShuffle: boolean;
};

export const getActiveGenreFilterForSection = (
  librarySection: LibrarySection,
  seriesGenreFilter: string | null
) => (librarySection === 'series' ? seriesGenreFilter : null);

export const getFeedTargetForSection = (librarySection: LibrarySection): FeedTarget =>
  librarySection === 'series' ? 'series' : librarySection === 'israeli' ? 'israeli' : 'movies';

export const buildRootRequestKey = ({
  target,
  category,
  genreId,
  year,
  seed
}: {
  target: FeedTarget;
  category: FeedCategory;
  genreId?: number | null;
  year?: YearFilter;
  seed?: number;
}) => [
  target,
  category,
  genreId ?? 'all',
  year ?? 'all',
  seed ?? 'default'
].join('|');

export const resolveRootRouteState = (route: MenuRoute): RootRouteState | null => {
  if (
    route.target === 'favorites'
    || route.target === 'history'
    || route.target === 'continue_watching'
    || route.target === 'search'
  ) {
    return null;
  }

  if (route.target === 'movies') {
    return {
      librarySection: 'all',
      movieCategory: route.category ?? 'popular',
      movieGenreId: route.genreId ?? null,
      seriesGenreFilter: null,
      yearFilter: route.year ?? 'all',
      refreshShuffle: route.category === 'random'
    };
  }

  if (route.target === 'series') {
    return {
      librarySection: 'series',
      seriesCategory: route.category ?? 'popular',
      movieGenreId: null,
      seriesGenreFilter: route.genreLabel ?? null,
      yearFilter: route.year ?? 'all',
      refreshShuffle: route.category === 'random'
    };
  }

  return {
    librarySection: 'israeli',
    israeliCategory: route.category ?? 'popular',
    movieGenreId: null,
    seriesGenreFilter: null,
    yearFilter: route.year ?? 'all',
    refreshShuffle: route.category === 'random'
  };
};
