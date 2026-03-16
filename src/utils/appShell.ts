import type { LibrarySection, SortMode, YearFilter } from './catalog';
import type { FeedCategory } from './menuConfig';
import type { TelegramDialogCategory } from './telegramDialogs';

export type RootCatalogState = {
  librarySection: LibrarySection;
  sortMode: SortMode;
  yearFilter: YearFilter;
  seriesGenreFilter: string | null;
  movieGenreId: number | null;
  movieCategory: FeedCategory;
  seriesCategory: FeedCategory;
  israeliCategory: FeedCategory;
  telegramCategory: TelegramDialogCategory;
};

export const DEFAULT_ROOT_CATALOG_STATE: RootCatalogState = {
  librarySection: 'all',
  sortMode: 'feed',
  yearFilter: 'all',
  seriesGenreFilter: null,
  movieGenreId: null,
  movieCategory: 'popular',
  seriesCategory: 'popular',
  israeliCategory: 'popular',
  telegramCategory: 'all'
};

export type AppShellSnapshot = {
  hasActiveMedia: boolean;
  hasPosterContextMovie: boolean;
  showTelegramAuthModal: boolean;
  hasSelectedMovie: boolean;
  showCinemaScreen: boolean;
  showSearch: boolean;
  hasNavContext: boolean;
  showSettings: boolean;
  isSidebarOpen: boolean;
};

export type AppShellLayer =
  | 'player'
  | 'posterContext'
  | 'telegramAuth'
  | 'settings'
  | 'cinema'
  | 'details'
  | 'search'
  | 'navContext'
  | 'sidebar'
  | 'corridor';

export type AppBackAction =
  | 'closePlayer'
  | 'closePosterContext'
  | 'closeTelegramAuth'
  | 'closeSettings'
  | 'closeCinemaScreen'
  | 'closeSelectedMovie'
  | 'closeSearch'
  | 'clearNavContext'
  | 'closeSidebar'
  | 'openSidebar'
  | 'noop';

export const resolveAppShellLayer = (snapshot: AppShellSnapshot): AppShellLayer => {
  if (snapshot.hasActiveMedia) return 'player';
  if (snapshot.hasPosterContextMovie) return 'posterContext';
  if (snapshot.showTelegramAuthModal) return 'telegramAuth';
  if (snapshot.showSettings) return 'settings';
  if (snapshot.showCinemaScreen) return 'cinema';
  if (snapshot.hasSelectedMovie) return 'details';
  if (snapshot.showSearch) return 'search';
  if (snapshot.hasNavContext) return 'navContext';
  if (snapshot.isSidebarOpen) return 'sidebar';
  return 'corridor';
};

export const resolveAppBackAction = (snapshot: AppShellSnapshot): AppBackAction => {
  switch (resolveAppShellLayer(snapshot)) {
    case 'player':
      return 'closePlayer';
    case 'posterContext':
      return 'closePosterContext';
    case 'telegramAuth':
      return 'closeTelegramAuth';
    case 'settings':
      return 'closeSettings';
    case 'cinema':
      return 'closeCinemaScreen';
    case 'details':
      return 'closeSelectedMovie';
    case 'search':
      return 'closeSearch';
    case 'navContext':
      return 'clearNavContext';
    case 'sidebar':
      return 'closeSidebar';
    case 'corridor':
      return 'openSidebar';
    default:
      return 'noop';
  }
};
