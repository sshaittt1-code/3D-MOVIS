export type LibrarySection = 'all' | 'series' | 'israeli' | 'favorites' | 'history';
export type SortMode = 'feed' | 'popular' | 'rating' | 'recent' | 'random';
export type YearFilter = 'all' | '2024_plus' | '2020s' | '2010s' | '2000s' | `${number}`;

export const SORT_OPTIONS: Array<{ id: SortMode; label: string }> = [
  { id: 'feed', label: 'Feed' },
  { id: 'popular', label: 'Popular' },
  { id: 'rating', label: 'Top Rated' },
  { id: 'recent', label: 'Recent' },
  { id: 'random', label: 'Random' }
];

export const YEAR_OPTIONS: Array<{ id: YearFilter; label: string }> = [
  { id: 'all', label: 'All Years' },
  { id: '2024_plus', label: '2024+' },
  { id: '2020s', label: '2020s' },
  { id: '2010s', label: '2010s' },
  { id: '2000s', label: '2000s' }
];

export const getItemYear = (item: any): number | null => {
  const rawValue = item?.year || item?.releaseYear || item?.release_date || item?.first_air_date || item?.premiered || '';
  const match = String(rawValue).match(/\d{4}/);
  return match ? Number.parseInt(match[0], 10) : null;
};

export const isExactYearFilter = (yearFilter: YearFilter): yearFilter is `${number}` =>
  /^\d{4}$/.test(String(yearFilter));

export const getApiYearFilter = (yearFilter: YearFilter) =>
  isExactYearFilter(yearFilter) ? yearFilter : null;

const passesYearFilter = (year: number | null, yearFilter: YearFilter) => {
  if (yearFilter === 'all') return true;
  if (!year) return false;
  if (isExactYearFilter(yearFilter)) return year === Number(yearFilter);
  if (yearFilter === '2024_plus') return year >= 2024;
  if (yearFilter === '2020s') return year >= 2020 && year <= 2029;
  if (yearFilter === '2010s') return year >= 2010 && year <= 2019;
  if (yearFilter === '2000s') return year >= 2000 && year <= 2009;
  return true;
};

export const getUniqueGenres = (items: any[]) =>
  Array.from(new Set(
    items.flatMap((item) =>
      String(item?.genre || '')
        .split(',')
        .map((genre) => genre.trim())
        .filter(Boolean)
    )
  )).slice(0, 12);

export const shuffleItems = <T,>(items: T[], seed: number) => {
  const output = [...items];
  let state = seed || 1;

  for (let index = output.length - 1; index > 0; index -= 1) {
    state = (state * 1664525 + 1013904223) % 4294967296;
    const swapIndex = state % (index + 1);
    [output[index], output[swapIndex]] = [output[swapIndex], output[index]];
  }

  return output;
};

export const applyCatalogFilters = (
  items: any[],
  options: {
    sortMode: SortMode;
    yearFilter: YearFilter;
    genreFilter?: string | null;
    randomSeed?: number;
  }
) => {
  const { sortMode, yearFilter, genreFilter, randomSeed = 1 } = options;

  let filtered = items.filter((item) => {
    const itemYear = getItemYear(item);
    const matchesGenre = !genreFilter || String(item?.genre || '').toLowerCase().includes(genreFilter.toLowerCase());
    return matchesGenre && passesYearFilter(itemYear, yearFilter);
  });

  if (sortMode === 'rating') {
    filtered = [...filtered].sort((left, right) => (right?.rating || 0) - (left?.rating || 0));
  } else if (sortMode === 'recent') {
    filtered = [...filtered].sort((left, right) => (getItemYear(right) || 0) - (getItemYear(left) || 0));
  } else if (sortMode === 'random') {
    filtered = shuffleItems(filtered, randomSeed);
  } else if (sortMode === 'feed') {
    filtered = [...filtered];
  } else {
    filtered = [...filtered].sort((left, right) => (right?.popularity || 0) - (left?.popularity || 0));
  }

  return filtered;
};
