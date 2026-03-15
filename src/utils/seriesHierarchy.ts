import type { CorridorItem, EpisodesNavContext, NavContext, SeasonsNavContext } from './contentModel';

export type SeriesSelectionAction = 'openDetails' | 'openSeasons' | 'openEpisodes';

export const getSeriesSelectionAction = (item: CorridorItem | null | undefined): SeriesSelectionAction => {
  if (!item) return 'openDetails';
  if (item.mediaType === 'tv') return 'openSeasons';
  if (item.mediaType === 'season') return 'openEpisodes';
  return 'openDetails';
};

export const buildSeasonsNavContext = (
  seriesItem: CorridorItem,
  seasons: CorridorItem[],
  seriesTitle?: string
): SeasonsNavContext => ({
  type: 'seasons',
  seriesId: Number(seriesItem.seriesId ?? seriesItem.id),
  seriesTitle: seriesTitle || seriesItem.seriesTitle || seriesItem.localizedTitle || seriesItem.title,
  seasons
});

export const buildEpisodesNavContext = (
  seasonItem: CorridorItem,
  episodes: CorridorItem[],
  parent: SeasonsNavContext,
  seasonTitle?: string
): EpisodesNavContext => ({
  type: 'episodes',
  seriesId: parent.seriesId,
  seasonNum: Number(seasonItem.seasonNum ?? seasonItem.season_number ?? 0),
  seriesTitle: parent.seriesTitle,
  seasonTitle: seasonTitle || seasonItem.seasonTitle || seasonItem.localizedTitle || seasonItem.title,
  episodes,
  parent
});

export const stepOutOfNavContext = (navContext: NavContext): NavContext => {
  if (!navContext) return null;
  if (navContext.type === 'episodes') return navContext.parent;
  return null;
};

export const getCorridorScopeKey = (rootScopeKey: string, navContext: NavContext) => {
  if (!navContext) return rootScopeKey;
  if (navContext.type === 'episodes') {
    return `episodes:${navContext.seriesId}:${navContext.seasonNum}`;
  }
  return `seasons:${navContext.seriesId}`;
};

export const getHierarchyMeta = (navContext: NavContext) => {
  if (!navContext) return null;
  if (navContext.type === 'episodes') {
    return {
      eyebrow: navContext.seriesTitle,
      title: navContext.seasonTitle,
      detail: `${navContext.episodes.length} episodes`,
      trail: `${navContext.seriesTitle} / ${navContext.seasonTitle}`
    };
  }

  return {
    eyebrow: 'Series Corridor',
    title: navContext.seriesTitle,
    detail: `${navContext.seasons.length} seasons`,
    trail: navContext.seriesTitle
  };
};
