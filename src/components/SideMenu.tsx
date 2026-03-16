import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ChevronLeft,
  Film,
  Flag,
  LogOut,
  MessageCircle,
  Search,
  Settings,
  Star,
  Tv
} from 'lucide-react';
import {
  buildSideMenuRoots,
  getRootIdForMenuItem,
  type SideMenuGroup,
  type SideMenuItem,
  type SideMenuRoot
} from '../utils/menuConfig';
import {
  buildDrawerEntries,
  getActionEntryId,
  getDefaultMenuControllerState,
  getInitialExpandedSubgroupId,
  getRailButtonId,
  getSubgroupEntryId,
  moveDrawerFocus,
  moveRailFocus,
  resolveMenuBackBehavior,
  syncMenuControllerState,
  type SideMenuDrawerEntry
} from '../utils/menuNavigation';
import { isTvBackKey } from '../utils/tvNavigation';
import { getTvDirection, isTvSelectKey, stopTvEvent } from '../utils/tvRemote';

type SideMenuProps = {
  visible?: boolean;
  isOpen: boolean;
  groups: SideMenuGroup[];
  telegramConnected: boolean;
  activeItemId: string;
  currentLabel: string;
  onActivate: (item: SideMenuItem) => void;
  onOpen: () => void;
  onClose: () => void;
};

const ICON_BY_KEY = {
  search: Search,
  favorites: Star,
  movies: Film,
  series: Tv,
  israeli: Flag,
  telegram: MessageCircle,
  settings: Settings,
  exit: LogOut
} as const;

const getRootById = (roots: SideMenuRoot[], rootId: string) =>
  roots.find((root) => root.id === rootId) ?? roots[0] ?? null;

export const SideMenu = ({
  visible = true,
  isOpen,
  groups,
  telegramConnected,
  activeItemId,
  currentLabel,
  onActivate,
  onOpen,
  onClose
}: SideMenuProps) => {
  const roots = useMemo(() => buildSideMenuRoots(groups, { telegramConnected }), [groups, telegramConnected]);
  const activeRootId = useMemo(() => getRootIdForMenuItem(roots, activeItemId), [activeItemId, roots]);
  const [menuState, setMenuState] = useState(() => getDefaultMenuControllerState(roots, activeRootId, activeItemId));
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const wasOpenRef = useRef(isOpen);

  useEffect(() => {
    setMenuState((prev) => {
      const base = syncMenuControllerState(roots, prev, {
        activeRootId,
        activeItemId,
        isDrawerOpen: isOpen
      });

      if (isOpen && !wasOpenRef.current) {
        return {
          ...base,
          focusedZone: 'rail',
          focusedDrawerEntryId: null
        };
      }

      if (!isOpen) {
        return {
          ...base,
          railActiveRootId: activeRootId || base.railActiveRootId,
          focusedZone: 'rail',
          focusedDrawerEntryId: null
        };
      }

      return base;
    });

    wasOpenRef.current = isOpen;
  }, [activeItemId, activeRootId, isOpen, roots]);

  const activeRoot = useMemo(
    () => getRootById(roots, menuState.railActiveRootId || activeRootId),
    [activeRootId, menuState.railActiveRootId, roots]
  );

  const drawerEntries = useMemo(
    () => buildDrawerEntries(activeRoot, menuState.expandedSubgroupId),
    [activeRoot, menuState.expandedSubgroupId]
  );

  useEffect(() => {
    if (!visible || !isOpen || !activeRoot) return;
    const focusId = menuState.focusedZone === 'drawer'
      ? menuState.focusedDrawerEntryId
      : getRailButtonId(activeRoot.id);

    if (!focusId) return;
    const nextFrame = window.requestAnimationFrame(() => {
      buttonRefs.current[focusId]?.focus();
    });

    return () => window.cancelAnimationFrame(nextFrame);
  }, [activeRoot, isOpen, menuState.focusedDrawerEntryId, menuState.focusedZone, visible]);

  const focusRailRoot = (rootId: string) => {
    const root = getRootById(roots, rootId);
    if (!root) return;

    const nextSubgroupId = getInitialExpandedSubgroupId(
      root,
      activeItemId,
      root.id === menuState.expandedRootId ? menuState.expandedSubgroupId : null
    );

    setMenuState((prev) => syncMenuControllerState(roots, {
      ...prev,
      railActiveRootId: root.id,
      expandedRootId: root.subgroups?.length ? root.id : null,
      expandedSubgroupId: nextSubgroupId,
      focusedZone: 'rail',
      focusedDrawerEntryId: null
    }, {
      activeRootId,
      activeItemId,
      isDrawerOpen: isOpen
    }));
  };

  const focusDrawerForRoot = (root: SideMenuRoot) => {
    const nextSubgroupId = getInitialExpandedSubgroupId(
      root,
      activeItemId,
      root.id === menuState.expandedRootId ? menuState.expandedSubgroupId : null
    );
    const nextFocusId = root.subgroups?.length
      ? getSubgroupEntryId(root.id, nextSubgroupId ?? root.subgroups[0].id)
      : getActionEntryId(root.id);

    if (!isOpen) {
      onOpen();
    }

    setMenuState((prev) => syncMenuControllerState(roots, {
      ...prev,
      railActiveRootId: root.id,
      expandedRootId: root.subgroups?.length ? root.id : null,
      expandedSubgroupId: nextSubgroupId,
      focusedZone: 'drawer',
      focusedDrawerEntryId: nextFocusId
    }, {
      activeRootId,
      activeItemId,
      isDrawerOpen: true
    }));
  };

  const collapseActiveSubgroup = () => {
    if (!activeRoot?.subgroups?.length || !menuState.expandedSubgroupId) {
      onClose();
      return;
    }

    setMenuState((prev) => ({
      ...prev,
      expandedSubgroupId: null,
      focusedZone: 'drawer',
      focusedDrawerEntryId: getSubgroupEntryId(activeRoot.id, menuState.expandedSubgroupId!)
    }));
  };

  const expandSubgroup = (subgroupId: string, focusFirstItem = false) => {
    if (!activeRoot?.subgroups?.length) return;

    const subgroup = activeRoot.subgroups.find((candidate) => candidate.id === subgroupId);
    const nextFocusId = focusFirstItem && subgroup?.items[0]
      ? subgroup.items[0].id
      : getSubgroupEntryId(activeRoot.id, subgroupId);

    setMenuState((prev) => ({
      ...prev,
      expandedSubgroupId: subgroupId,
      focusedZone: 'drawer',
      focusedDrawerEntryId: nextFocusId
    }));
  };

  const handleRailSelect = (root: SideMenuRoot) => {
    onActivate(root.defaultItem);
  };

  const handleDrawerSelect = (entry: SideMenuDrawerEntry) => {
    if (entry.kind === 'action') {
      onActivate(entry.item);
      return;
    }

    if (entry.kind === 'subcategory') {
      const isExpanded = menuState.expandedSubgroupId === entry.subgroupId;
      expandSubgroup(entry.subgroupId, isExpanded);
      return;
    }

    onActivate(entry.item);
  };

  const handleMenuKeyDown = (event: React.KeyboardEvent) => {
    if (!visible || !isOpen) return;

    const direction = getTvDirection(event);
    const currentRoot = activeRoot;
    if (!currentRoot) return;

    if (menuState.focusedZone === 'rail') {
      if (direction === 'down') {
        stopTvEvent(event);
        focusRailRoot(moveRailFocus(roots, currentRoot.id, 1));
        return;
      }

      if (direction === 'up') {
        stopTvEvent(event);
        focusRailRoot(moveRailFocus(roots, currentRoot.id, -1));
        return;
      }

      if (direction === 'right') {
        stopTvEvent(event);
        focusDrawerForRoot(currentRoot);
        return;
      }

      if (direction === 'left') {
        stopTvEvent(event);
        onClose();
        return;
      }

      if (isTvBackKey(event)) {
        stopTvEvent(event);
        onClose();
        return;
      }

      if (isTvSelectKey(event)) {
        stopTvEvent(event);
        handleRailSelect(currentRoot);
      }

      return;
    }

    if (direction === 'down') {
      stopTvEvent(event);
      setMenuState((prev) => ({
        ...prev,
        focusedDrawerEntryId: moveDrawerFocus(drawerEntries, prev.focusedDrawerEntryId, 1)
      }));
      return;
    }

    if (direction === 'up') {
      stopTvEvent(event);
      setMenuState((prev) => ({
        ...prev,
        focusedDrawerEntryId: moveDrawerFocus(drawerEntries, prev.focusedDrawerEntryId, -1)
      }));
      return;
    }

    const currentEntry = drawerEntries.find((entry) => entry.id === menuState.focusedDrawerEntryId) ?? drawerEntries[0];
    if (!currentEntry) return;

    if (direction === 'left') {
      stopTvEvent(event);
      if (currentEntry.kind === 'item') {
        setMenuState((prev) => ({
          ...prev,
          focusedDrawerEntryId: getSubgroupEntryId(currentRoot.id, currentEntry.subgroupId)
        }));
        return;
      }

      if (currentEntry.kind === 'subcategory' && menuState.expandedSubgroupId === currentEntry.subgroupId) {
        collapseActiveSubgroup();
        return;
      }

      setMenuState((prev) => ({
        ...prev,
        focusedZone: 'rail',
        focusedDrawerEntryId: null
      }));
      return;
    }

    if (direction === 'right' && currentEntry.kind === 'subcategory') {
      stopTvEvent(event);
      expandSubgroup(currentEntry.subgroupId, true);
      return;
    }

    if (isTvBackKey(event)) {
      stopTvEvent(event);
      const backBehavior = resolveMenuBackBehavior(currentRoot, menuState);
      if (backBehavior === 'collapse-subgroup') {
        collapseActiveSubgroup();
        return;
      }

      onClose();
      return;
    }

    if (isTvSelectKey(event)) {
      stopTvEvent(event);
      handleDrawerSelect(currentEntry);
    }
  };

  if (!visible || !activeRoot) {
    return null;
  }

  const railClassName = isOpen
    ? 'border-white/18 bg-[linear-gradient(180deg,rgba(16,23,31,0.92),rgba(9,14,20,0.94))] shadow-[-12px_0_40px_rgba(0,0,0,0.2)]'
    : 'border-white/14 bg-[linear-gradient(180deg,rgba(12,20,28,0.76),rgba(7,12,18,0.86))] shadow-[-12px_0_32px_rgba(0,0,0,0.18)]';

  return (
    <div
      className="absolute inset-y-0 right-0 z-40 flex items-stretch pointer-events-none"
      data-tv-scope={isOpen ? 'ui' : undefined}
      data-tv-back-scope={isOpen ? 'local' : undefined}
      data-testid="side-menu"
      onKeyDown={handleMenuKeyDown}
    >
      <AnimatePresence initial={false}>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="pointer-events-none w-24 bg-gradient-to-l from-black/40 via-black/18 to-transparent"
            />
            <motion.aside
              initial={{ opacity: 0, x: 18 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 18 }}
              transition={{ type: 'spring', stiffness: 280, damping: 30 }}
              className="pointer-events-auto h-full w-[20rem] border-l border-white/10 bg-[linear-gradient(180deg,rgba(9,14,20,0.96),rgba(6,10,16,0.98))] px-5 py-5 shadow-[-32px_0_80px_rgba(0,0,0,0.45)] backdrop-blur-[26px]"
              dir="rtl"
            >
              <div className="rounded-[2rem] border border-white/10 bg-white/[0.03] px-5 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                <div className="flex items-center justify-between gap-4">
                  <div className="rounded-full border border-emerald-400/26 bg-emerald-400/12 px-3 py-1 text-[0.72rem] font-semibold text-emerald-200">
                    {currentLabel}
                  </div>
                  <div className="text-[0.68rem] uppercase tracking-[0.28em] text-white/35">Main rail</div>
                </div>
                <h2 className="mt-4 text-4xl font-bold text-white">{activeRoot.label}</h2>
                <p className="mt-3 text-sm leading-6 text-white/58">{activeRoot.description}</p>
              </div>

              <div className="mt-5 max-h-[calc(100%-11rem)] overflow-y-auto pr-1">
                {activeRoot.subgroups?.length ? (
                  <div className="space-y-3">
                    {activeRoot.subgroups.map((subgroup) => {
                      const subgroupButtonId = getSubgroupEntryId(activeRoot.id, subgroup.id);
                      const isExpanded = menuState.expandedSubgroupId === subgroup.id;
                      const isFocused = menuState.focusedZone === 'drawer' && menuState.focusedDrawerEntryId === subgroupButtonId;

                      return (
                        <div
                          key={subgroup.id}
                          className={`rounded-[1.75rem] border px-3 py-3 transition-all ${
                            isExpanded
                              ? 'border-emerald-400/22 bg-emerald-400/[0.07]'
                              : 'border-white/8 bg-white/[0.025]'
                          }`}
                        >
                          <button
                            ref={(node) => { buttonRefs.current[subgroupButtonId] = node; }}
                            onFocus={() => setMenuState((prev) => ({ ...prev, focusedZone: 'drawer', focusedDrawerEntryId: subgroupButtonId }))}
                            onClick={() => expandSubgroup(subgroup.id, isExpanded)}
                            data-testid={`menu-subgroup-${subgroup.id}`}
                            className={`hc-focusable flex w-full items-center justify-between rounded-[1.25rem] border px-4 py-3 text-right transition-all ${
                              isFocused || isExpanded
                                ? 'border-emerald-400/28 bg-[linear-gradient(90deg,rgba(14,74,56,0.62),rgba(8,40,33,0.42))] text-white shadow-[0_0_26px_rgba(0,255,204,0.16)]'
                                : 'border-white/8 bg-transparent text-white/76 hover:border-emerald-400/16 hover:bg-white/[0.04]'
                            }`}
                          >
                            <ChevronLeft className={`h-4 w-4 text-emerald-200/80 transition-transform ${isExpanded ? '-rotate-90' : ''}`} />
                            <span className="text-sm font-semibold">{subgroup.label}</span>
                          </button>

                          <AnimatePresence initial={false}>
                            {isExpanded && (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="overflow-hidden"
                              >
                                <div className="space-y-2 px-1 pb-1 pt-3">
                                  {subgroup.items.map((item) => {
                                    const isItemFocused = menuState.focusedZone === 'drawer' && menuState.focusedDrawerEntryId === item.id;
                                    const isItemActive = activeItemId === item.id;

                                    return (
                                      <button
                                        key={item.id}
                                        ref={(node) => { buttonRefs.current[item.id] = node; }}
                                        onFocus={() => setMenuState((prev) => ({ ...prev, focusedZone: 'drawer', focusedDrawerEntryId: item.id }))}
                                        onClick={() => onActivate(item)}
                                        data-testid={`menu-item-${item.id}`}
                                        className={`hc-focusable w-full rounded-[1.15rem] border px-4 py-3 text-right transition-all ${
                                          isItemFocused
                                            ? 'border-emerald-400/30 bg-[linear-gradient(90deg,rgba(0,255,204,0.16),rgba(18,86,72,0.26))] text-white shadow-[0_0_24px_rgba(0,255,204,0.16)]'
                                            : isItemActive
                                              ? 'border-emerald-400/18 bg-emerald-400/[0.09] text-white/94'
                                              : 'border-white/6 bg-white/[0.03] text-white/74 hover:border-emerald-400/16 hover:bg-white/[0.05]'
                                        }`}
                                      >
                                        <div className="text-sm font-semibold">{item.label}</div>
                                        <div className="mt-1 text-xs leading-5 text-white/46">{item.description}</div>
                                      </button>
                                    );
                                  })}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-[1.9rem] border border-white/10 bg-white/[0.03] p-5">
                    <div className="text-xs uppercase tracking-[0.24em] text-white/32">Destination</div>
                    <div className="mt-3 text-2xl font-semibold text-white">{activeRoot.label}</div>
                    <p className="mt-3 text-sm leading-6 text-white/55">{activeRoot.description}</p>
                    <button
                      ref={(node) => { buttonRefs.current[getActionEntryId(activeRoot.id)] = node; }}
                      onFocus={() => setMenuState((prev) => ({
                        ...prev,
                        focusedZone: 'drawer',
                        focusedDrawerEntryId: getActionEntryId(activeRoot.id)
                      }))}
                      onClick={() => onActivate(activeRoot.defaultItem)}
                      data-testid={`menu-action-${activeRoot.id}`}
                      className={`hc-focusable mt-6 w-full rounded-[1.25rem] border px-5 py-4 text-right transition-all ${
                        menuState.focusedZone === 'drawer' && menuState.focusedDrawerEntryId === getActionEntryId(activeRoot.id)
                          ? 'border-emerald-400/30 bg-[linear-gradient(90deg,rgba(0,255,204,0.16),rgba(18,86,72,0.26))] text-white shadow-[0_0_24px_rgba(0,255,204,0.16)]'
                          : 'border-white/8 bg-white/[0.03] text-white/82 hover:border-emerald-400/18 hover:bg-white/[0.05]'
                      }`}
                    >
                      <div className="text-sm font-semibold">{activeRoot.defaultItem.label}</div>
                      <div className="mt-1 text-xs leading-5 text-white/46">{activeRoot.defaultItem.description}</div>
                    </button>
                  </div>
                )}
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div
        className={`pointer-events-auto flex h-full w-[4.9rem] flex-col items-center gap-3 border-l px-2 py-5 backdrop-blur-[20px] transition-all ${railClassName}`}
        dir="rtl"
      >
        <div className="mb-2 text-[0.62rem] uppercase tracking-[0.3em] text-white/28">Menu</div>
        <div className="flex-1 space-y-2 overflow-y-auto">
          {roots.map((root) => {
            const Icon = ICON_BY_KEY[root.iconKey];
            const isActiveRoot = activeRootId === root.id;
            const isPreviewRoot = menuState.railActiveRootId === root.id;
            const isDrawerFocused = isOpen && menuState.focusedZone === 'rail' && menuState.railActiveRootId === root.id;

            return (
              <button
                key={root.id}
                ref={(node) => { buttonRefs.current[getRailButtonId(root.id)] = node; }}
                tabIndex={isOpen ? 0 : -1}
                onFocus={() => {
                  if (!isOpen) return;
                  focusRailRoot(root.id);
                }}
                onClick={() => {
                  focusRailRoot(root.id);
                  handleRailSelect(root);
                }}
                data-testid={`menu-root-${root.id.replace(/^root-/, '')}`}
                className={`hc-focusable group relative flex h-[4.35rem] w-[4.35rem] items-center justify-center rounded-[1.6rem] border transition-all ${
                  isDrawerFocused
                    ? 'border-emerald-400/34 bg-[linear-gradient(180deg,rgba(0,255,204,0.18),rgba(18,92,74,0.26))] text-white shadow-[0_0_26px_rgba(0,255,204,0.18)]'
                    : isPreviewRoot || isActiveRoot
                      ? 'border-emerald-400/22 bg-emerald-400/[0.09] text-emerald-100'
                      : 'border-white/8 bg-white/[0.03] text-white/64 hover:border-emerald-400/18 hover:bg-white/[0.05]'
                }`}
                aria-label={root.label}
                title={root.label}
              >
                {(isPreviewRoot || isActiveRoot) && (
                  <span className="absolute inset-y-3 left-0 w-[3px] rounded-full bg-gradient-to-b from-emerald-300 via-emerald-400 to-cyan-300" />
                )}
                <Icon className="h-6 w-6" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
