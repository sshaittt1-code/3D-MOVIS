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
  type SideMenuRoot,
  type SideMenuSubcategoryGroup
} from '../utils/menuConfig';
import { isTvBackKey } from '../utils/tvNavigation';
import { getTvDirection, isTvSelectKey, stopTvEvent } from '../utils/tvRemote';

type SideMenuProps = {
  isOpen: boolean;
  groups: SideMenuGroup[];
  telegramConnected: boolean;
  activeItemId: string;
  currentLabel: string;
  onActivate: (item: SideMenuItem) => void;
  onClose: () => void;
};

type VisibleEntry =
  | { id: string; kind: 'root'; root: SideMenuRoot }
  | { id: string; kind: 'subcategory'; rootId: string; subgroup: SideMenuSubcategoryGroup }
  | { id: string; kind: 'item'; rootId: string; subgroupId: string; item: SideMenuItem };

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

const rootEntryId = (rootId: string) => `root:${rootId}`;
const subgroupEntryId = (rootId: string, subgroupId: string) => `subgroup:${rootId}:${subgroupId}`;

const buildVisibleEntries = (
  roots: SideMenuRoot[],
  expandedRootId: string | null,
  expandedSubgroupId: string | null
): VisibleEntry[] => {
  const entries: VisibleEntry[] = [];

  roots.forEach((root) => {
    entries.push({ id: rootEntryId(root.id), kind: 'root', root });

    if (root.id !== expandedRootId || !root.subgroups?.length) {
      return;
    }

    root.subgroups.forEach((subgroup) => {
      entries.push({
        id: subgroupEntryId(root.id, subgroup.id),
        kind: 'subcategory',
        rootId: root.id,
        subgroup
      });

      if (expandedSubgroupId !== subgroup.id) {
        return;
      }

      subgroup.items.forEach((item) => {
        entries.push({
          id: item.id,
          kind: 'item',
          rootId: root.id,
          subgroupId: subgroup.id,
          item
        });
      });
    });
  });

  return entries;
};

const getInitialExpandedSubgroupId = (root: SideMenuRoot | undefined, activeItemId: string) => {
  if (!root?.subgroups?.length) {
    return null;
  }

  return root.subgroups.find((group) => group.items.some((item) => item.id === activeItemId))?.id
    ?? root.subgroups[0].id;
};

export const SideMenu = ({ isOpen, groups, telegramConnected, activeItemId, currentLabel, onActivate, onClose }: SideMenuProps) => {
  const roots = useMemo(() => buildSideMenuRoots(groups, { telegramConnected }), [groups, telegramConnected]);
  const activeRootId = useMemo(() => getRootIdForMenuItem(roots, activeItemId), [activeItemId, roots]);
  const [expandedRootId, setExpandedRootId] = useState<string | null>(null);
  const [expandedSubgroupId, setExpandedSubgroupId] = useState<string | null>(null);
  const [focusedEntryId, setFocusedEntryId] = useState<string>('');
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const visibleEntries = useMemo(
    () => buildVisibleEntries(roots, expandedRootId, expandedSubgroupId),
    [expandedRootId, expandedSubgroupId, roots]
  );

  useEffect(() => {
    if (!isOpen) return;

    const activeRoot = roots.find((root) => root.id === activeRootId);
    if (activeRoot?.subgroups?.length) {
      setExpandedRootId(activeRoot.id);
      setExpandedSubgroupId(getInitialExpandedSubgroupId(activeRoot, activeItemId));
    } else {
      setExpandedRootId(null);
      setExpandedSubgroupId(null);
    }
  }, [activeItemId, activeRootId, isOpen, roots]);

  useEffect(() => {
    if (!isOpen || visibleEntries.length === 0) return;

    const preferredId = visibleEntries.find((entry) => entry.id === activeItemId)?.id
      ?? (activeRootId ? rootEntryId(activeRootId) : '')
      ?? visibleEntries[0].id;

    setFocusedEntryId(preferredId || visibleEntries[0].id);
  }, [activeItemId, activeRootId, isOpen, visibleEntries]);

  useEffect(() => {
    if (!isOpen || !focusedEntryId) return;
    buttonRefs.current[focusedEntryId]?.focus();
  }, [focusedEntryId, isOpen]);

  const moveFocus = (direction: 1 | -1) => {
    const currentIndex = visibleEntries.findIndex((entry) => entry.id === focusedEntryId);
    const nextIndex = currentIndex === -1
      ? 0
      : Math.max(0, Math.min(visibleEntries.length - 1, currentIndex + direction));
    setFocusedEntryId(visibleEntries[nextIndex]?.id || focusedEntryId);
  };

  const openRoot = (root: SideMenuRoot) => {
    if (!root.subgroups?.length) {
      onActivate(root.defaultItem);
      return;
    }

    setExpandedRootId(root.id);
    setExpandedSubgroupId(getInitialExpandedSubgroupId(root, activeItemId));
    setFocusedEntryId(subgroupEntryId(root.id, getInitialExpandedSubgroupId(root, activeItemId) ?? root.subgroups[0].id));
  };

  const toggleSubgroup = (rootId: string, subgroupId: string) => {
    setExpandedRootId(rootId);
    setExpandedSubgroupId((current) => current === subgroupId ? null : subgroupId);
    setFocusedEntryId(subgroupEntryId(rootId, subgroupId));
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    const direction = getTvDirection(event);

    if (direction === 'down') {
      stopTvEvent(event);
      moveFocus(1);
      return;
    }

    if (direction === 'up') {
      stopTvEvent(event);
      moveFocus(-1);
      return;
    }

    const currentEntry = visibleEntries.find((entry) => entry.id === focusedEntryId);
    if (!currentEntry) return;

    if (direction === 'right') {
      stopTvEvent(event);
      if (currentEntry.kind === 'root') {
        openRoot(currentEntry.root);
        return;
      }
      if (currentEntry.kind === 'subcategory') {
        toggleSubgroup(currentEntry.rootId, currentEntry.subgroup.id);
      }
      return;
    }

    if (direction === 'left') {
      stopTvEvent(event);
      if (currentEntry.kind === 'item') {
        setFocusedEntryId(subgroupEntryId(currentEntry.rootId, currentEntry.subgroupId));
        return;
      }
      if (currentEntry.kind === 'subcategory') {
        setExpandedSubgroupId(null);
        setFocusedEntryId(rootEntryId(currentEntry.rootId));
        return;
      }
      if (currentEntry.kind === 'root' && currentEntry.root.id === expandedRootId) {
        setExpandedRootId(null);
        setExpandedSubgroupId(null);
        return;
      }
      onClose();
      return;
    }

    if (isTvBackKey(event)) {
      stopTvEvent(event);
      onClose();
      return;
    }

    if (!isTvSelectKey(event)) return;

    stopTvEvent(event);
    if (currentEntry.kind === 'root') {
      openRoot(currentEntry.root);
      return;
    }

    if (currentEntry.kind === 'subcategory') {
      toggleSubgroup(currentEntry.rootId, currentEntry.subgroup.id);
      return;
    }

    onActivate(currentEntry.item);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="absolute inset-y-0 right-0 z-40 flex pointer-events-none" dir="rtl">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="w-28 bg-gradient-to-l from-black/35 via-black/15 to-transparent"
          />
          <motion.aside
            initial={{ opacity: 0, x: 48 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 48 }}
            transition={{ type: 'spring', stiffness: 260, damping: 28 }}
            data-tv-scope="ui"
            data-tv-back-scope="local"
            className="hc-tv-safe-right hc-tv-safe-y pointer-events-auto h-full w-[23rem] border-l border-white/15 bg-[linear-gradient(180deg,rgba(218,224,240,0.62),rgba(206,213,228,0.42))] shadow-[-24px_0_80px_rgba(0,0,0,0.45)] backdrop-blur-[34px]"
            onKeyDown={handleKeyDown}
          >
            <div className="px-6 pb-6 pt-4">
              <div className="rounded-[2.2rem] border border-white/45 bg-white/16 px-5 py-5 shadow-[0_10px_40px_rgba(9,15,30,0.16)]">
                <p className="text-xs tracking-[0.24em] text-slate-500">HOME MENU</p>
                <h2 className="mt-3 text-3xl font-bold text-slate-800">{currentLabel}</h2>
                <p className="mt-2 text-sm text-slate-500">בחירה אחת ברורה בכל פעם, עם חזרה מהירה למסדרון.</p>
              </div>
            </div>

            <div className="h-[calc(100%-11rem)] overflow-y-auto px-4 pb-6">
              <div className="space-y-2">
                {roots.map((root) => {
                  const Icon = ICON_BY_KEY[root.iconKey];
                  const isExpanded = expandedRootId === root.id;
                  const isActiveRoot = activeRootId === root.id;
                  const isFocusedRoot = focusedEntryId === rootEntryId(root.id);
                  const rootHasSubgroups = Boolean(root.subgroups?.length);

                  return (
                    <div key={root.id}>
                      <button
                        ref={(node) => { buttonRefs.current[rootEntryId(root.id)] = node; }}
                        onFocus={() => setFocusedEntryId(rootEntryId(root.id))}
                        onClick={() => openRoot(root)}
                        className={`hc-focusable relative w-full overflow-hidden rounded-[1.8rem] border px-5 py-4 text-right transition-all ${
                          isFocusedRoot || isActiveRoot
                            ? 'border-white/30 bg-[linear-gradient(90deg,rgba(141,154,188,0.55),rgba(120,124,255,0.38))] text-slate-900 shadow-[0_12px_34px_rgba(84,92,210,0.16)]'
                            : 'border-white/15 bg-white/6 text-slate-700 hover:bg-white/12'
                        }`}
                      >
                        {(isFocusedRoot || isActiveRoot) && (
                          <div className="absolute inset-y-5 right-0 w-1 rounded-full bg-gradient-to-b from-[#4f7bff] via-[#7a63ff] to-[#a64dff]" />
                        )}
                        <div className="flex items-center gap-4">
                          <div className="flex-1">
                            <div className={`text-[1.55rem] font-semibold ${isFocusedRoot || isActiveRoot ? 'text-[#4459ff]' : 'text-slate-700'}`}>
                              {root.label}
                            </div>
                            <div className="mt-1 text-xs leading-5 text-slate-500">{root.description}</div>
                          </div>
                          {rootHasSubgroups && (
                            <ChevronLeft
                              className={`h-5 w-5 text-slate-400 transition-transform ${isExpanded ? '-rotate-90' : ''}`}
                            />
                          )}
                          <div className={`flex h-12 w-12 items-center justify-center rounded-2xl border ${
                            isFocusedRoot || isActiveRoot
                              ? 'border-transparent bg-[linear-gradient(135deg,#4f7bff,#8e5bff)] text-white'
                              : 'border-white/30 bg-white/55 text-slate-600'
                          }`}>
                            <Icon className="h-6 w-6" />
                          </div>
                        </div>
                      </button>

                      <AnimatePresence initial={false}>
                        {isExpanded && root.subgroups?.length ? (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="space-y-3 px-4 pb-2 pt-3">
                              {root.subgroups.map((subgroup) => {
                                const subgroupId = subgroupEntryId(root.id, subgroup.id);
                                const isSubgroupFocused = focusedEntryId === subgroupId;
                                const isSubgroupExpanded = expandedSubgroupId === subgroup.id;

                                return (
                                  <div key={subgroup.id} className="rounded-[1.6rem] bg-black/6 p-2">
                                    <button
                                      ref={(node) => { buttonRefs.current[subgroupId] = node; }}
                                      onFocus={() => setFocusedEntryId(subgroupId)}
                                      onClick={() => toggleSubgroup(root.id, subgroup.id)}
                                      className={`hc-focusable flex w-full items-center justify-between rounded-[1.2rem] px-4 py-3 text-right transition-all ${
                                        isSubgroupFocused || isSubgroupExpanded
                                          ? 'bg-white/55 text-slate-800'
                                          : 'bg-transparent text-slate-600 hover:bg-white/25'
                                      }`}
                                    >
                                      <ChevronLeft className={`h-4 w-4 text-slate-400 transition-transform ${isSubgroupExpanded ? '-rotate-90' : ''}`} />
                                      <span className="text-sm font-semibold">{subgroup.label}</span>
                                    </button>

                                    <AnimatePresence initial={false}>
                                      {isSubgroupExpanded && (
                                        <motion.div
                                          initial={{ opacity: 0, height: 0 }}
                                          animate={{ opacity: 1, height: 'auto' }}
                                          exit={{ opacity: 0, height: 0 }}
                                          className="overflow-hidden"
                                        >
                                          <div className="space-y-2 px-2 pb-2 pt-3">
                                            {subgroup.items.map((item) => {
                                              const isItemFocused = focusedEntryId === item.id;
                                              const isItemActive = activeItemId === item.id;

                                              return (
                                                <button
                                                  key={item.id}
                                                  ref={(node) => { buttonRefs.current[item.id] = node; }}
                                                  onFocus={() => setFocusedEntryId(item.id)}
                                                  onClick={() => onActivate(item)}
                                                  className={`hc-focusable w-full rounded-[1rem] border px-4 py-3 text-right text-sm transition-all ${
                                                    isItemFocused
                                                      ? 'border-[#5d72ff]/35 bg-[linear-gradient(90deg,rgba(93,114,255,0.18),rgba(140,96,255,0.16))] text-slate-900'
                                                      : isItemActive
                                                        ? 'border-[#5d72ff]/22 bg-white/38 text-slate-800'
                                                        : 'border-transparent bg-white/18 text-slate-600 hover:bg-white/30'
                                                  }`}
                                                >
                                                  <div className="font-semibold">{item.label}</div>
                                                  <div className="mt-1 text-xs text-slate-500">{item.description}</div>
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
                          </motion.div>
                        ) : null}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
};
