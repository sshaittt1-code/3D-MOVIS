const HEBREW_DIACRITICS = /[\u0591-\u05C7]/g;
const NON_WORD_TEXT = /[^\p{L}\p{N}\s]/gu;

type SearchAliasKind = 'localized' | 'original' | 'alternate' | 'derived';

type SearchAlias = {
  value: string;
  normalized: string;
  compact: string;
  kind: SearchAliasKind;
};

const normalizeCompact = (value: string) => normalizeSearchText(value).replace(/\s/g, '');

const pushAlias = (aliases: SearchAlias[], seen: Set<string>, value: unknown, kind: SearchAliasKind) => {
  const rawValue = String(value || '').trim();
  if (!rawValue) return;
  const normalized = normalizeSearchText(rawValue);
  if (!normalized || seen.has(normalized)) return;
  seen.add(normalized);
  aliases.push({
    value: rawValue,
    normalized,
    compact: normalized.replace(/\s/g, ''),
    kind
  });
};

const flattenAltTitles = (value: unknown): string[] => {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.flatMap((entry) => {
      if (typeof entry === 'string') return [entry];
      if (entry && typeof entry === 'object') {
        const record = entry as Record<string, unknown>;
        return [
          record.title,
          record.name,
          record.localizedTitle,
          record.originalTitle,
          record.iso_3166_1,
          record.iso_639_1
        ].filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
      }
      return [];
    });
  }
  return typeof value === 'string' ? [value] : [];
};

const isSubsequenceMatch = (query: string, candidate: string) => {
  if (!query || !candidate || query.length > candidate.length) return false;
  let queryIndex = 0;
  for (let candidateIndex = 0; candidateIndex < candidate.length && queryIndex < query.length; candidateIndex += 1) {
    if (candidate[candidateIndex] === query[queryIndex]) {
      queryIndex += 1;
    }
  }
  return queryIndex === query.length;
};

export const normalizeSearchText = (value: string) =>
  String(value || '')
    .normalize('NFKD')
    .replace(HEBREW_DIACRITICS, '')
    .toLowerCase()
    .replace(NON_WORD_TEXT, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const shouldTriggerPredictiveSearch = (query: string, minChars = 3) =>
  normalizeCompact(query).length >= minChars;

export const getSearchAliases = (item: any): string[] => {
  const aliases: SearchAlias[] = [];
  const seen = new Set<string>();

  [
    item?.localizedTitle,
    item?.hebrewTitle,
    item?.title,
    item?.name
  ].forEach((value) => pushAlias(aliases, seen, value, 'localized'));

  [
    item?.originalTitle,
    item?.originalName,
    item?.seriesTitle
  ].forEach((value) => pushAlias(aliases, seen, value, 'original'));

  flattenAltTitles(item?.alternateTitles).forEach((value) => pushAlias(aliases, seen, value, 'alternate'));

  return aliases.map((alias) => alias.value);
};

const getStructuredAliases = (item: any) => {
  const aliases: SearchAlias[] = [];
  const seen = new Set<string>();

  [
    item?.localizedTitle,
    item?.hebrewTitle,
    item?.title,
    item?.name
  ].forEach((value) => pushAlias(aliases, seen, value, 'localized'));

  [
    item?.originalTitle,
    item?.originalName,
    item?.seriesTitle
  ].forEach((value) => pushAlias(aliases, seen, value, 'original'));

  flattenAltTitles(item?.alternateTitles).forEach((value) => pushAlias(aliases, seen, value, 'alternate'));

  if (aliases.length === 0) {
    pushAlias(aliases, seen, item?.id ?? item?.uniqueId, 'derived');
  }

  return aliases;
};

const getSearchIdentity = (item: any) =>
  `${item?.mediaType || 'unknown'}:${item?.id ?? item?.uniqueId ?? item?.title ?? 'unknown'}`;

const getAliasBoost = (kind: SearchAliasKind) =>
  kind === 'localized' ? 20 : kind === 'original' ? 12 : kind === 'alternate' ? 8 : 0;

export const scoreSearchCandidate = (item: any, query: string) => {
  const normalizedQuery = normalizeSearchText(query);
  const compactQuery = normalizeCompact(query);
  if (!normalizedQuery || !compactQuery) return 0;

  const queryTokens = normalizedQuery.split(' ').filter(Boolean);
  let bestScore = 0;

  for (const alias of getStructuredAliases(item)) {
    const aliasBoost = getAliasBoost(alias.kind);
    const aliasTokens = alias.normalized.split(' ').filter(Boolean);

    if (alias.normalized === normalizedQuery || alias.compact === compactQuery) {
      bestScore = Math.max(bestScore, 180 + aliasBoost);
      continue;
    }

    if (alias.normalized.startsWith(normalizedQuery) || alias.compact.startsWith(compactQuery)) {
      bestScore = Math.max(bestScore, 148 + aliasBoost);
      continue;
    }

    if (aliasTokens.some((token) => token.startsWith(normalizedQuery) || token.startsWith(compactQuery))) {
      bestScore = Math.max(bestScore, 126 + aliasBoost);
      continue;
    }

    if (queryTokens.every((token) => alias.normalized.includes(token))) {
      bestScore = Math.max(bestScore, 104 + aliasBoost);
      continue;
    }

    if (alias.normalized.includes(normalizedQuery) || alias.compact.includes(compactQuery)) {
      bestScore = Math.max(bestScore, 88 + aliasBoost);
      continue;
    }

    if (isSubsequenceMatch(compactQuery, alias.compact)) {
      bestScore = Math.max(bestScore, 58 + aliasBoost);
    }
  }

  if (bestScore === 0) return 0;
  return bestScore + Math.min(18, Number(item?.popularity || 0) / 40) + Math.min(12, Number(item?.rating || 0));
};

export const rankSearchResults = (items: any[], query: string) => {
  const seen = new Set<string>();
  return [...items]
    .map((item) => ({ item, score: scoreSearchCandidate(item, query) }))
    .filter(({ item, score }) => {
      const identity = getSearchIdentity(item);
      if (score <= 0 || seen.has(identity)) return false;
      seen.add(identity);
      return true;
    })
    .sort((left, right) => right.score - left.score)
    .map(({ item }) => item);
};
