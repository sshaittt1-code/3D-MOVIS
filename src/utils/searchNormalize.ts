const HEBREW_DIACRITICS = /[\u0591-\u05C7]/g;
const NON_WORD_TEXT = /[^\p{L}\p{N}\s]/gu;

export const normalizeSearchText = (value: string) =>
  String(value || '')
    .normalize('NFKD')
    .replace(HEBREW_DIACRITICS, '')
    .toLowerCase()
    .replace(NON_WORD_TEXT, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const shouldTriggerPredictiveSearch = (query: string, minChars = 3) =>
  normalizeSearchText(query).replace(/\s/g, '').length >= minChars;

export const getSearchAliases = (item: any) => {
  const aliases = [
    item?.localizedTitle,
    item?.title,
    item?.originalTitle,
    item?.originalName,
    item?.name,
    item?.seriesTitle
  ]
    .filter(Boolean)
    .map((value) => String(value).trim())
    .filter(Boolean);

  return Array.from(new Set(aliases));
};

const getSearchIdentity = (item: any) =>
  `${item?.mediaType || 'unknown'}:${item?.id ?? item?.uniqueId ?? item?.title ?? 'unknown'}`;

export const scoreSearchCandidate = (item: any, query: string) => {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return 0;

  const queryTokens = normalizedQuery.split(' ').filter(Boolean);
  let bestScore = 0;

  for (const alias of getSearchAliases(item)) {
    const normalizedAlias = normalizeSearchText(alias);
    if (!normalizedAlias) continue;

    if (normalizedAlias === normalizedQuery) {
      bestScore = Math.max(bestScore, 140);
      continue;
    }

    if (normalizedAlias.startsWith(normalizedQuery)) {
      bestScore = Math.max(bestScore, 110);
      continue;
    }

    if (normalizedAlias.split(' ').some((token) => token.startsWith(normalizedQuery))) {
      bestScore = Math.max(bestScore, 92);
      continue;
    }

    if (queryTokens.every((token) => normalizedAlias.includes(token))) {
      bestScore = Math.max(bestScore, 76);
      continue;
    }

    if (normalizedAlias.includes(normalizedQuery)) {
      bestScore = Math.max(bestScore, 64);
    }
  }

  if (bestScore === 0) return 0;
  return bestScore + Math.min(20, Number(item?.popularity || 0) / 50) + Math.min(10, Number(item?.rating || 0));
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
