import type { SideMenuItem, SideMenuRoot } from './menuConfig';

export type SideMenuFocusZone = 'rail' | 'drawer';

export type SideMenuDrawerEntry =
  | { id: string; kind: 'action'; item: SideMenuItem }
  | { id: string; kind: 'subcategory'; subgroupId: string; label: string }
  | { id: string; kind: 'item'; subgroupId: string; item: SideMenuItem };

export type SideMenuControllerState = {
  railActiveRootId: string;
  expandedRootId: string | null;
  expandedSubgroupId: string | null;
  focusedZone: SideMenuFocusZone;
  focusedDrawerEntryId: string | null;
};

type SyncMenuControllerOptions = {
  activeRootId: string;
  activeItemId: string;
  isDrawerOpen: boolean;
};

export const getRailButtonId = (rootId: string) => `rail:${rootId}`;
export const getSubgroupEntryId = (rootId: string, subgroupId: string) => `subgroup:${rootId}:${subgroupId}`;
export const getActionEntryId = (rootId: string) => `action:${rootId}`;

const getRootById = (roots: SideMenuRoot[], rootId: string | null | undefined) =>
  roots.find((root) => root.id === rootId) ?? roots[0] ?? null;

export const getInitialExpandedSubgroupId = (
  root: SideMenuRoot | null | undefined,
  activeItemId: string,
  preferredSubgroupId?: string | null
) => {
  if (!root?.subgroups?.length) {
    return null;
  }

  if (preferredSubgroupId && root.subgroups.some((group) => group.id === preferredSubgroupId)) {
    return preferredSubgroupId;
  }

  const activeGroup = root.subgroups.find((group) => group.items.some((item) => item.id === activeItemId));
  return activeGroup?.id ?? root.subgroups[0].id;
};

export const buildDrawerEntries = (
  root: SideMenuRoot | null | undefined,
  expandedSubgroupId: string | null
): SideMenuDrawerEntry[] => {
  if (!root) return [];

  if (!root.subgroups?.length) {
    return [{ id: getActionEntryId(root.id), kind: 'action', item: root.defaultItem }];
  }

  const entries: SideMenuDrawerEntry[] = [];

  root.subgroups.forEach((subgroup) => {
    entries.push({
      id: getSubgroupEntryId(root.id, subgroup.id),
      kind: 'subcategory',
      subgroupId: subgroup.id,
      label: subgroup.label
    });

    if (expandedSubgroupId !== subgroup.id) {
      return;
    }

    subgroup.items.forEach((item) => {
      entries.push({
        id: item.id,
        kind: 'item',
        subgroupId: subgroup.id,
        item
      });
    });
  });

  return entries;
};

const getDefaultDrawerEntryId = (
  root: SideMenuRoot | null | undefined,
  expandedSubgroupId: string | null,
  activeItemId: string
) => {
  if (!root) return null;
  if (!root.subgroups?.length) {
    return getActionEntryId(root.id);
  }

  if (activeItemId && root.subgroups.some((group) => group.items.some((item) => item.id === activeItemId))) {
    return activeItemId;
  }

  if (expandedSubgroupId) {
    return getSubgroupEntryId(root.id, expandedSubgroupId);
  }

  return getSubgroupEntryId(root.id, root.subgroups[0].id);
};

export const getDefaultMenuControllerState = (
  roots: SideMenuRoot[],
  activeRootId: string,
  activeItemId: string
): SideMenuControllerState => {
  const root = getRootById(roots, activeRootId);
  const expandedSubgroupId = getInitialExpandedSubgroupId(root, activeItemId);

  return {
    railActiveRootId: root?.id ?? '',
    expandedRootId: root?.subgroups?.length ? root.id : null,
    expandedSubgroupId,
    focusedZone: 'rail',
    focusedDrawerEntryId: getDefaultDrawerEntryId(root, expandedSubgroupId, activeItemId)
  };
};

export const syncMenuControllerState = (
  roots: SideMenuRoot[],
  state: SideMenuControllerState,
  options: SyncMenuControllerOptions
): SideMenuControllerState => {
  const railRoot = getRootById(
    roots,
    options.isDrawerOpen
      ? state.railActiveRootId
      : options.activeRootId || state.railActiveRootId
  );

  const expandedSubgroupId = getInitialExpandedSubgroupId(
    railRoot,
    options.activeItemId,
    railRoot?.id === state.expandedRootId ? state.expandedSubgroupId : null
  );
  const drawerEntries = buildDrawerEntries(railRoot, expandedSubgroupId);
  const focusedDrawerEntryId =
    state.focusedZone === 'drawer' && drawerEntries.some((entry) => entry.id === state.focusedDrawerEntryId)
      ? state.focusedDrawerEntryId
      : getDefaultDrawerEntryId(railRoot, expandedSubgroupId, options.activeItemId);

  return {
    railActiveRootId: railRoot?.id ?? '',
    expandedRootId: railRoot?.subgroups?.length ? railRoot.id : null,
    expandedSubgroupId,
    focusedZone: options.isDrawerOpen ? state.focusedZone : 'rail',
    focusedDrawerEntryId: options.isDrawerOpen && state.focusedZone === 'drawer' ? focusedDrawerEntryId : null
  };
};

export const moveRailFocus = (
  roots: SideMenuRoot[],
  currentRootId: string,
  direction: 1 | -1
) => {
  if (roots.length === 0) return currentRootId;
  const currentIndex = roots.findIndex((root) => root.id === currentRootId);
  const nextIndex = currentIndex === -1
    ? 0
    : Math.max(0, Math.min(roots.length - 1, currentIndex + direction));

  return roots[nextIndex]?.id ?? currentRootId;
};

export const moveDrawerFocus = (
  entries: SideMenuDrawerEntry[],
  currentEntryId: string | null,
  direction: 1 | -1
) => {
  if (entries.length === 0) return currentEntryId;
  const currentIndex = entries.findIndex((entry) => entry.id === currentEntryId);
  const nextIndex = currentIndex === -1
    ? 0
    : Math.max(0, Math.min(entries.length - 1, currentIndex + direction));

  return entries[nextIndex]?.id ?? currentEntryId;
};

export const resolveMenuBackBehavior = (
  root: SideMenuRoot | null | undefined,
  state: SideMenuControllerState
) => {
  if (root?.subgroups?.length && state.expandedSubgroupId) {
    return 'collapse-subgroup' as const;
  }

  return 'close-drawer' as const;
};
