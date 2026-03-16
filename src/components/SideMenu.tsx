import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { SideMenuGroup, SideMenuItem } from '../utils/menuConfig';
import { isTvBackKey } from '../utils/tvNavigation';
import { getTvDirection, isTvSelectKey } from '../utils/tvRemote';

type SideMenuProps = {
  isOpen: boolean;
  groups: SideMenuGroup[];
  activeItemId: string;
  currentLabel: string;
  onActivate: (item: SideMenuItem) => void;
  onClose: () => void;
};

type VisibleEntry =
  | { id: string; kind: 'group'; groupId: string }
  | { id: string; kind: 'item'; groupId: string; item: SideMenuItem };

export const SideMenu = ({ isOpen, groups, activeItemId, currentLabel, onActivate, onClose }: SideMenuProps) => {
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [focusedEntryId, setFocusedEntryId] = useState<string>('');
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    if (!isOpen) return;
    setExpandedGroups((current) => {
      const next = { ...current };
      groups.forEach((group) => {
        if (next[group.id] === undefined) next[group.id] = !!group.defaultExpanded;
      });

      const activeGroup = groups.find((group) => group.items.some((item) => item.id === activeItemId));
      if (activeGroup) next[activeGroup.id] = true;
      return next;
    });
  }, [activeItemId, groups, isOpen]);

  const visibleEntries = useMemo<VisibleEntry[]>(() => {
    const entries: VisibleEntry[] = [];
    groups.forEach((group) => {
      entries.push({ id: `group:${group.id}`, kind: 'group', groupId: group.id });
      if (expandedGroups[group.id]) {
        group.items.forEach((item) => entries.push({ id: item.id, kind: 'item', groupId: group.id, item }));
      }
    });
    return entries;
  }, [expandedGroups, groups]);

  useEffect(() => {
    if (!isOpen || visibleEntries.length === 0) return;
    const preferred = visibleEntries.find((entry) => entry.id === activeItemId)?.id ?? visibleEntries[1]?.id ?? visibleEntries[0].id;
    setFocusedEntryId(preferred);
  }, [activeItemId, isOpen, visibleEntries]);

  useEffect(() => {
    if (!isOpen || !focusedEntryId) return;
    buttonRefs.current[focusedEntryId]?.focus();
  }, [focusedEntryId, isOpen]);

  const moveFocus = (direction: 1 | -1) => {
    const currentIndex = visibleEntries.findIndex((entry) => entry.id === focusedEntryId);
    const nextIndex = currentIndex === -1 ? 0 : Math.max(0, Math.min(visibleEntries.length - 1, currentIndex + direction));
    setFocusedEntryId(visibleEntries[nextIndex]?.id || focusedEntryId);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    const direction = getTvDirection(event);

    if (direction === 'down') {
      event.preventDefault();
      moveFocus(1);
      return;
    }
    if (direction === 'up') {
      event.preventDefault();
      moveFocus(-1);
      return;
    }

    const currentEntry = visibleEntries.find((entry) => entry.id === focusedEntryId);
    if (!currentEntry) return;

    if (direction === 'right') {
      event.preventDefault();
      if (currentEntry.kind === 'group') {
        setExpandedGroups((current) => ({ ...current, [currentEntry.groupId]: true }));
      }
      return;
    }

    if (direction === 'left') {
      event.preventDefault();
      if (currentEntry.kind === 'item') {
        setFocusedEntryId(`group:${currentEntry.groupId}`);
        return;
      }
      if (expandedGroups[currentEntry.groupId]) {
        setExpandedGroups((current) => ({ ...current, [currentEntry.groupId]: false }));
        return;
      }
      onClose();
      return;
    }

    if (isTvBackKey(event)) {
      event.preventDefault();
      onClose();
      return;
    }

    if (isTvSelectKey(event)) {
      event.preventDefault();
      if (currentEntry.kind === 'group') {
        setExpandedGroups((current) => ({ ...current, [currentEntry.groupId]: !current[currentEntry.groupId] }));
      } else {
        onActivate(currentEntry.item);
      }
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="absolute inset-y-0 right-0 z-40 flex pointer-events-none" dir="rtl">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-28 bg-gradient-to-l from-black/35 via-black/15 to-transparent" />
          <motion.aside
            initial={{ opacity: 0, x: 48 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 48 }}
            transition={{ type: 'spring', stiffness: 260, damping: 28 }}
            data-tv-scope="ui"
            data-tv-back-scope="local"
            className="hc-tv-safe-right hc-tv-safe-y pointer-events-auto h-full w-[22rem] border-l border-[#00ffcc]/16 bg-[linear-gradient(180deg,rgba(5,15,20,0.94),rgba(2,7,10,0.82))] shadow-[-24px_0_80px_rgba(0,0,0,0.45)] backdrop-blur-2xl"
            onKeyDown={handleKeyDown}
          >
            <div className="border-b border-white/10 px-6 pb-5 pt-2">
              <p className="text-[11px] uppercase tracking-[0.35em] text-[#7debd6]">Corridor Console</p>
              <div className="hc-card mt-4 px-5 py-4">
                <p className="text-xs text-white/55">המסדרון הפעיל</p>
                <h2 className="mt-2 text-3xl font-bold text-white">{currentLabel}</h2>
                <p className="mt-2 text-sm text-white/60">בחירה כאן מחליפה את המסדרון מיידית, בלי מסך ביניים ובלי לאבד שליטה בשלט.</p>
              </div>
            </div>

            <div className="h-[calc(100%-10rem)] overflow-y-auto px-3 py-5">
              {groups.map((group) => {
                const isExpanded = !!expandedGroups[group.id];
                const isGroupFocused = focusedEntryId === `group:${group.id}`;
                return (
                  <section key={group.id} className="hc-panel-section mb-4 p-3">
                    <button
                      ref={(node) => { buttonRefs.current[`group:${group.id}`] = node; }}
                      onFocus={() => setFocusedEntryId(`group:${group.id}`)}
                      onClick={() => setExpandedGroups((current) => ({ ...current, [group.id]: !current[group.id] }))}
                      className={`hc-focusable w-full rounded-[22px] border px-4 py-3 text-right transition-all ${
                        isGroupFocused
                          ? 'border-[#00ffcc]/24 bg-[#00ffcc]/12 text-white shadow-[0_0_24px_rgba(0,255,204,0.14)]'
                          : 'border-transparent bg-transparent text-white/90 hover:bg-white/5'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-lg font-semibold">{group.title}</p>
                          <p className="mt-1 text-xs text-white/45">{group.subtitle}</p>
                        </div>
                        <span className={`text-lg text-[#7debd6] transition-transform ${isExpanded ? 'rotate-180' : ''}`}>⌃</span>
                      </div>
                    </button>

                    <AnimatePresence initial={false}>
                      {isExpanded && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                          <div className="mt-3 space-y-2">
                            {group.items.map((item) => {
                              const isActive = activeItemId === item.id;
                              const isFocused = focusedEntryId === item.id;
                              const toneClass = item.tone === 'accent'
                                ? 'border-[#00ffcc]/20'
                                : item.tone === 'settings'
                                  ? 'border-blue-400/16'
                                  : 'border-white/8';

                              return (
                                <button
                                  key={item.id}
                                  ref={(node) => { buttonRefs.current[item.id] = node; }}
                                  onFocus={() => setFocusedEntryId(item.id)}
                                  onClick={() => onActivate(item)}
                                  data-focused={isFocused ? 'true' : undefined}
                                  className={`hc-focusable w-full rounded-[22px] border px-4 py-3 text-right transition-all ${toneClass} ${
                                    isFocused
                                      ? 'bg-[#00ffcc]/14 text-white shadow-[0_0_26px_rgba(0,255,204,0.16)]'
                                      : isActive
                                        ? 'bg-[#00ffcc]/10 text-white'
                                        : 'bg-black/10 text-white/85 hover:bg-white/5'
                                  }`}
                                >
                                  <div className="flex items-start gap-3">
                                    <span className={`mt-1 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 ${
                                      isFocused || isActive ? 'bg-[#00ffcc]/20 text-[#7debd6]' : 'bg-white/5 text-white/60'
                                    }`}>
                                      {item.icon}
                                    </span>
                                    <div className="flex-1">
                                      <div className="flex items-center justify-between gap-3">
                                        <span className="text-base font-semibold">{item.label}</span>
                                        {isActive && <span className="hc-chip uppercase tracking-[0.2em] text-[#7debd6]">Live</span>}
                                      </div>
                                      <p className="mt-1 text-xs leading-5 text-white/50">{item.description}</p>
                                    </div>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </section>
                );
              })}
            </div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
};
