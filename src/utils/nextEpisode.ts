export const AUTOPLAY_PRELOAD_SECONDS = 6;

export const findNextEpisodeInSeason = (currentEpisode: any, episodes: any[]) => {
  if (!currentEpisode?.episode_number) return null;
  const sortedEpisodes = [...episodes].sort((left, right) => (left.episode_number || 0) - (right.episode_number || 0));
  return sortedEpisodes.find((episode) => (episode.episode_number || 0) > currentEpisode.episode_number) || null;
};

export const findNextSeason = (currentSeasonNumber: number, seasons: any[]) =>
  [...seasons]
    .sort((left, right) => (left.season_number || 0) - (right.season_number || 0))
    .find((season) => (season.season_number || 0) > currentSeasonNumber) || null;

export const shouldPrepareNextEpisode = (
  currentTime: number,
  duration: number,
  preloadStarted: boolean,
  autoplayEnabled: boolean
) => autoplayEnabled && !preloadStarted && duration > 0 && duration - currentTime <= AUTOPLAY_PRELOAD_SECONDS;
