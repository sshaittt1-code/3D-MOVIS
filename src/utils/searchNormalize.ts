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
        ].filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
      }
      return [];
    });
  }
  return typeof value === 'string' ? [value] : [];
};

export const normalizeSearchText = (value: string) =>
  String(value || '')
    .normalize('NFKD')
    .replace(HEBREW_DIACRITICS, '')
    .toLowerCase()
    .replace(NON_WORD_TEXT, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const shouldTriggerPredictiveSearch = (query: string, minChars = 2) =>
  normalizeCompact(query).length >= minChars;

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
  kind === 'localized' ? 30 : kind === 'original' ? 20 : kind === 'alternate' ? 10 : 0;

export const scoreSearchCandidate = (item: any, query: string) => {
  const normalizedQuery = normalizeSearchText(query);
  const compactQuery = normalizeCompact(query);
  if (!normalizedQuery || !compactQuery) return 0;

  const queryTokens = normalizedQuery.split(' ').filter(Boolean);
  let bestScore = 0;

  for (const alias of getStructuredAliases(item)) {
    const aliasBoost = getAliasBoost(alias.kind);
    const aliasTokens = alias.normalized.split(' ').filter(Boolean);

    // 1. Exact match (Highest)
    if (alias.normalized === normalizedQuery || alias.compact === compactQuery) {
      bestScore = Math.max(bestScore, 200 + aliasBoost);
      continue;
    }

    // 2. Starts with (High)
    if (alias.normalized.startsWith(normalizedQuery) || alias.compact.startsWith(compactQuery)) {
      bestScore = Math.max(bestScore, 150 + aliasBoost);
      continue;
    }

    // 3. Any token starts with (Medium-High)
    if (aliasTokens.some((token) => token.startsWith(normalizedQuery))) {
      bestScore = Math.max(bestScore, 130 + aliasBoost);
      continue;
    }

    // 4. All query tokens present in alias (Medium)
    if (queryTokens.every((token) => alias.normalized.includes(token))) {
      bestScore = Math.max(bestScore, 110 + aliasBoost);
      continue;
    }

    // 5. Alias contains query (Low-Medium)
    if (alias.normalized.includes(normalizedQuery)) {
      bestScore = Math.max(bestScore, 90 + aliasBoost);
      continue;
    }
  }

  if (bestScore === 0) return 0;

  // Tiny tie-breakers for popularity/rating
  const popularityScore = Math.min(10, Number(item?.popularity || 0) / 100);
  const ratingScore = Math.min(5, Number(item?.rating || 0) / 2);

  return bestScore + popularityScore + ratingScore;
};

export const rankSearchResults = (items: any[], query: string) => {
  const seen = new Set<string>();
  const results = [];

  for (const item of items) {
    const identity = getSearchIdentity(item);
    if (seen.has(identity)) continue;

    const score = scoreSearchCandidate(item, query);
    if (score > 0) {
      seen.add(identity);
      results.push({ item, score });
    }
  }

  return results
    .sort((left, right) => right.score - left.score)
    .map((r) => r.item);
};
