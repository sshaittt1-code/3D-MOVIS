export const buildLoadMorePageKey = (rootRequestKey: string, page: number) =>
  `${rootRequestKey}::page:${page}`;

export const shouldAdvanceContentPage = (appendedCount: number) => appendedCount > 0;

export const canTriggerLoadMoreForPage = (
  lastTriggeredPageKey: string | null,
  activeLoadMorePageKey: string | null,
  nextPageKey: string
) => lastTriggeredPageKey !== nextPageKey && activeLoadMorePageKey !== nextPageKey;

export const isCurrentLoadMoreRequest = ({
  activeRootRequestKey,
  requestRootRequestKey,
  activeLoadMorePageKey,
  requestPageKey
}: {
  activeRootRequestKey: string;
  requestRootRequestKey: string;
  activeLoadMorePageKey: string | null;
  requestPageKey: string;
}) =>
  activeRootRequestKey === requestRootRequestKey &&
  activeLoadMorePageKey === requestPageKey;
