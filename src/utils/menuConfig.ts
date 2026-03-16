import type { LibrarySection, YearFilter } from './catalog';
import type { TelegramDialogCategory } from './telegramDialogs';

export type FeedCategory = 'popular' | 'top_rated' | 'trending' | 'new_releases' | 'recently_active' | 'random';
export type SettingsPanel = 'general' | 'telegram' | 'updates';

export type MenuRoute =
  | { target: 'movies'; category?: FeedCategory; genreId?: number | null; year?: YearFilter }
  | { target: 'series'; category?: FeedCategory; genreLabel?: string | null; year?: YearFilter }
  | { target: 'israeli'; category?: FeedCategory; year?: YearFilter }
  | { target: 'telegram'; category?: TelegramDialogCategory }
  | { target: 'continue_watching' }
  | { target: 'favorites' }
  | { target: 'history' }
  | { target: 'search' };

export type SideMenuItem =
  | {
      id: string;
      label: string;
      description: string;
      icon: string;
      tone?: 'accent' | 'default' | 'settings';
      kind: 'route';
      route: MenuRoute;
    }
  | {
      id: string;
      label: string;
      description: string;
      icon: string;
      tone?: 'accent' | 'default' | 'settings';
      kind: 'settings';
      panel: SettingsPanel;
    }
  | {
      id: string;
      label: string;
      description: string;
      icon: string;
      tone?: 'accent' | 'default' | 'settings';
      kind: 'action';
      action: 'exit';
    };

export type SideMenuGroup = {
  id: string;
  title: string;
  subtitle: string;
  defaultExpanded?: boolean;
  items: SideMenuItem[];
};

type GenreOption = { id: number; name: string; tmdbId: number | null };

const movieCategoryItem = (id: string, label: string, description: string, category: FeedCategory): SideMenuItem => ({
  id,
  label,
  description,
  icon: category === 'popular' ? '🎬' : category === 'top_rated' ? '★' : category === 'trending' ? '↗' : category === 'new_releases' ? '🆕' : '🎲',
  kind: 'route',
  route: { target: 'movies', category }
});

const seriesCategoryItem = (id: string, label: string, description: string, category: FeedCategory): SideMenuItem => ({
  id,
  label,
  description,
  icon: category === 'popular' ? '📺' : category === 'top_rated' ? '★' : category === 'trending' ? '↗' : category === 'recently_active' ? '🕒' : '🎲',
  kind: 'route',
  route: { target: 'series', category }
});

const israeliCategoryItem = (id: string, label: string, description: string, category: FeedCategory): SideMenuItem => ({
  id,
  label,
  description,
  icon: category === 'popular' ? '🇮🇱' : category === 'top_rated' ? '★' : category === 'trending' ? '↗' : category === 'recently_active' ? '🕒' : '🎲',
  kind: 'route',
  route: { target: 'israeli', category }
});

const telegramRouteItem = (
  id: string,
  label: string,
  description: string,
  category: TelegramDialogCategory
): SideMenuItem => ({
  id,
  label,
  description,
  icon: category === 'channels' ? '◉' : category === 'groups' ? '◎' : '✈',
  kind: 'route',
  route: { target: 'telegram', category }
});

export const buildSideMenuGroups = ({
  movieGenres,
  seriesGenres,
  continueWatchingCount,
  favoritesCount,
  historyCount,
  telegramCount,
  telegramConnected
}: {
  movieGenres: GenreOption[];
  seriesGenres: string[];
  continueWatchingCount: number;
  favoritesCount: number;
  historyCount: number;
  telegramCount: number;
  telegramConnected: boolean;
}): SideMenuGroup[] => {
  const movieGenreItems = movieGenres
    .filter((genre) => genre.tmdbId)
    .slice(0, 8)
    .map((genre) => ({
      id: `movies-genre-${genre.tmdbId}`,
      label: genre.name,
      description: `סרטים בז'אנר ${genre.name}`,
      icon: '⌬',
      kind: 'route' as const,
      route: { target: 'movies' as const, category: 'popular' as const, genreId: genre.tmdbId }
    }));

  const movieYearItems = ['2025', '2024', '2023', '2022'].map((year) => ({
    id: `movies-year-${year}`,
    label: year,
    description: `סרטים משנה ${year}`,
    icon: '⌛',
    kind: 'route' as const,
    route: { target: 'movies' as const, category: 'popular' as const, year: year as YearFilter }
  }));

  const seriesGenreItems = seriesGenres.slice(0, 8).map((genreLabel) => ({
    id: `series-genre-${genreLabel}`,
    label: genreLabel,
    description: `סדרות בז'אנר ${genreLabel}`,
    icon: '⌬',
    kind: 'route' as const,
    route: { target: 'series' as const, category: 'popular' as const, genreLabel }
  }));

  const seriesYearItems = ['2025', '2024', '2023', '2022'].map((year) => ({
    id: `series-year-${year}`,
    label: year,
    description: `סדרות משנה ${year}`,
    icon: '⌛',
    kind: 'route' as const,
    route: { target: 'series' as const, category: 'popular' as const, year: year as YearFilter }
  }));

  return [
    {
      id: 'quick',
      title: 'מעבר מהיר',
      subtitle: 'החלפה מיידית של המסדרון',
      defaultExpanded: true,
      items: [
        { id: 'quick-movies', label: 'סרטים', description: 'המסדרון הראשי של הסרטים', icon: '🎬', tone: 'accent', kind: 'route', route: { target: 'movies', category: 'popular' } },
        { id: 'quick-series', label: 'סדרות', description: 'המסדרון הראשי של הסדרות', icon: '📺', tone: 'accent', kind: 'route', route: { target: 'series', category: 'popular' } },
        { id: 'quick-israeli', label: 'ישראלי', description: 'תוכן ישראלי במסדרון נפרד', icon: '🇮🇱', tone: 'accent', kind: 'route', route: { target: 'israeli', category: 'popular' } },
        {
          id: 'quick-telegram',
          label: `טלגרם (${telegramCount})`,
          description: telegramConnected ? 'ערוצים וקבוצות מחשבון Telegram שלך' : 'התחבר ל-Telegram כדי לפתוח את מסדרון הערוצים והקבוצות',
          icon: '✈',
          tone: 'accent',
          kind: 'route',
          route: { target: 'telegram', category: 'all' }
        },
        { id: 'quick-continue', label: `המשך צפייה (${continueWatchingCount})`, description: 'חזרה מהירה לתוכן שעצרת באמצע', icon: '▶', kind: 'route', route: { target: 'continue_watching' } },
        { id: 'quick-favorites', label: `מועדפים (${favoritesCount})`, description: 'כל מה שסימנת במקום אחד', icon: '☆', kind: 'route', route: { target: 'favorites' } },
        { id: 'quick-history', label: `היסטוריה (${historyCount})`, description: 'צפיות אחרונות מסודרות לפי זמן', icon: '⏱', kind: 'route', route: { target: 'history' } },
        { id: 'quick-search', label: 'חיפוש', description: 'חיפוש ישיר שמחליף את המסדרון', icon: '⌕', kind: 'route', route: { target: 'search' } }
      ]
    },
    {
      id: 'movies',
      title: 'סרטים',
      subtitle: "קטגוריות, ז'אנרים ושנים",
      defaultExpanded: true,
      items: [
        movieCategoryItem('movies-popular', 'פופולרי', 'מה שנצפה ומדובר עכשיו', 'popular'),
        movieCategoryItem('movies-top-rated', 'הכי מדורג', 'בחירה לפי דירוג גבוה', 'top_rated'),
        movieCategoryItem('movies-trending', 'טרנדי', 'סרטים חמים של השבוע', 'trending'),
        movieCategoryItem('movies-new', 'חדשים', 'מהדורות חדשות וטריות', 'new_releases'),
        movieCategoryItem('movies-random', 'מיקס אקראי', 'מסדרון מפתיע בכל כניסה', 'random'),
        ...movieGenreItems,
        ...movieYearItems
      ]
    },
    {
      id: 'series',
      title: 'סדרות',
      subtitle: 'מעברים ישירים למסדרונות סדרות בלבד',
      items: [
        seriesCategoryItem('series-popular', 'פופולרי', 'סדרות בולטות כרגע', 'popular'),
        seriesCategoryItem('series-top-rated', 'הכי מדורג', 'לפי איכות והצבעות', 'top_rated'),
        seriesCategoryItem('series-trending', 'טרנדי', 'מה חם השבוע', 'trending'),
        seriesCategoryItem('series-active', 'פעילות לאחרונה', 'סדרות עם פעילות חדשה', 'recently_active'),
        seriesCategoryItem('series-random', 'מיקס אקראי', 'גילוי סדרות בצורה חופשית', 'random'),
        ...seriesGenreItems,
        ...seriesYearItems
      ]
    },
    {
      id: 'israeli',
      title: 'ישראלי',
      subtitle: 'קטגוריה עצמאית של סרטים וסדרות ישראליים',
      items: [
        israeliCategoryItem('israeli-popular', 'פופולרי', 'תוכן ישראלי בולט כרגע', 'popular'),
        israeliCategoryItem('israeli-top-rated', 'הכי מדורג', 'דירוגים גבוהים בתוכן ישראלי', 'top_rated'),
        israeliCategoryItem('israeli-trending', 'טרנדי', 'מה חם עכשיו בתוכן ישראלי', 'trending'),
        israeliCategoryItem('israeli-recent', 'פעילות לאחרונה', 'יצירות ישראליות חדשות ורלוונטיות', 'recently_active'),
        israeliCategoryItem('israeli-random', 'מיקס אקראי', 'גילוי חופשי של תוכן ישראלי', 'random')
      ]
    },
    {
      id: 'telegram',
      title: 'טלגרם',
      subtitle: telegramConnected
        ? 'ערוצים וקבוצות ישירות מחשבון Telegram שלך'
        : 'התחבר ל-Telegram כדי להציג את הערוצים והקבוצות שלך במסדרון',
      items: [
        telegramRouteItem('telegram-all', 'הכל', telegramConnected ? `כל ה-dialogs הזמינים (${telegramCount})` : 'כל הערוצים והקבוצות יופיעו כאן אחרי החיבור', 'all'),
        telegramRouteItem('telegram-groups', 'קבוצות', 'רק קבוצות וסופר-קבוצות', 'groups'),
        telegramRouteItem('telegram-channels', 'ערוצים', 'רק ערוצי broadcast ותוכן', 'channels')
      ]
    },
    {
      id: 'settings',
      title: 'מערכת',
      subtitle: 'הגדרות, טלגרם ועדכונים',
      items: [
        { id: 'settings-general', label: 'הגדרות כלליות', description: 'ניגון, ממשק והתנהגות כללית', icon: '⚙', tone: 'settings', kind: 'settings', panel: 'general' },
        { id: 'settings-telegram', label: 'חיבור טלגרם', description: 'התחברות או ניתוק לחשבון', icon: '✈', tone: 'settings', kind: 'settings', panel: 'telegram' },
        { id: 'settings-updates', label: 'עדכוני APK', description: 'בדיקה, הורדה והתקנה של גרסאות', icon: '⬇', tone: 'settings', kind: 'settings', panel: 'updates' },
        { id: 'settings-exit', label: 'יציאה', description: 'סגירת האפליקציה מהמכשיר', icon: '⎋', tone: 'settings', kind: 'action', action: 'exit' }
      ]
    }
  ];
};

export const getActiveMenuItemId = ({
  librarySection,
  activeGenreId,
  seriesGenreFilter,
  yearFilter,
  movieCategory,
  seriesCategory,
  israeliCategory,
  telegramCategory = 'all',
  showSearch
}: {
  librarySection: LibrarySection;
  activeGenreId: number | null;
  seriesGenreFilter: string | null;
  yearFilter: YearFilter;
  movieCategory: FeedCategory;
  seriesCategory: FeedCategory;
  israeliCategory: FeedCategory;
  telegramCategory?: TelegramDialogCategory;
  showSearch: boolean;
}) => {
  if (showSearch) return 'quick-search';
  if (librarySection === 'telegram') {
    return telegramCategory === 'groups'
      ? 'telegram-groups'
      : telegramCategory === 'channels'
        ? 'telegram-channels'
        : 'telegram-all';
  }
  if (librarySection === 'continue_watching') return 'quick-continue';
  if (librarySection === 'favorites') return 'quick-favorites';
  if (librarySection === 'history') return 'quick-history';
  if (librarySection === 'israeli') {
    if (yearFilter !== 'all') return 'quick-israeli';
    return israeliCategory === 'top_rated'
      ? 'israeli-top-rated'
      : israeliCategory === 'recently_active'
        ? 'israeli-recent'
        : israeliCategory === 'random'
          ? 'israeli-random'
          : israeliCategory === 'trending'
            ? 'israeli-trending'
            : 'israeli-popular';
  }
  if (librarySection === 'series') {
    if (seriesGenreFilter) return `series-genre-${seriesGenreFilter}`;
    if (yearFilter !== 'all') return `series-year-${yearFilter}`;
    return seriesCategory === 'top_rated'
      ? 'series-top-rated'
      : seriesCategory === 'recently_active'
        ? 'series-active'
        : seriesCategory === 'random'
          ? 'series-random'
          : seriesCategory === 'trending'
            ? 'series-trending'
            : 'series-popular';
  }
  if (activeGenreId) return `movies-genre-${activeGenreId}`;
  if (yearFilter !== 'all') return `movies-year-${yearFilter}`;
  return librarySection === 'all'
    ? movieCategory === 'top_rated'
      ? 'movies-top-rated'
      : movieCategory === 'new_releases'
        ? 'movies-new'
        : movieCategory === 'trending'
          ? 'movies-trending'
          : movieCategory === 'random'
            ? 'movies-random'
            : 'movies-popular'
    : 'quick-movies';
};
