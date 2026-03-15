import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { SideMenuGroup, SideMenuItem } from '../utils/menuConfig';

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
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveFocus(1);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveFocus(-1);
      return;
    }

    const currentEntry = visibleEntries.find((entry) => entry.id === focusedEntryId);
    if (!currentEntry) return;

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      if (currentEntry.kind === 'group') {
        setExpandedGroups((current) => ({ ...current, [currentEntry.groupId]: true }));
      }
      return;
    }

    if (event.key === 'ArrowLeft') {
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

    if (event.key === 'Escape' || event.key === 'Backspace') {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key === 'Enter' || event.key === 'Select') {
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
            className="pointer-events-auto h-full w-[22rem] border-l border-[#00ffcc]/20 bg-[linear-gradient(180deg,rgba(4,16,20,0.92),rgba(2,6,10,0.74))] shadow-[-24px_0_80px_rgba(0,0,0,0.45)] backdrop-blur-2xl"
            onKeyDown={handleKeyDown}
          >
            <div className="border-b border-white/10 px-6 pb-5 pt-8">
              <p className="text-[11px] tracking-[0.35em] text-[#7debd6] uppercase">Corridor Console</p>
              <div className="mt-4 rounded-[28px] border border-white/10 bg-white/5 px-5 py-4 shadow-[0_0_30px_rgba(0,255,204,0.08)]">
                <p className="text-xs text-white/55">המסדרון הפעיל</p>
                <h2 className="mt-2 text-3xl font-bold text-white">{currentLabel}</h2>
                <p className="mt-2 text-sm text-white/60">בחירה כאן מחליפה את המסדרון מיידית, בלי מסך ביניים.</p>
              </div>
            </div>

            <div className="h-[calc(100%-10rem)] overflow-y-auto px-3 py-5">
              {groups.map((group) => {
                const isExpanded = !!expandedGroups[group.id];
                return (
                  <section key={group.id} className="mb-4 rounded-[28px] border border-white/8 bg-white/[0.03] p-3">
                    <button
                      ref={(node) => { buttonRefs.current[`group:${group.id}`] = node; }}
                      onFocus={() => setFocusedEntryId(`group:${group.id}`)}
                      onClick={() => setExpandedGroups((current) => ({ ...current, [group.id]: !current[group.id] }))}
                      className={`w-full rounded-[22px] px-4 py-3 text-right transition-all ${focusedEntryId === `group:${group.id}` ? 'bg-[#00ffcc]/15 text-white shadow-[0_0_25px_rgba(0,255,204,0.16)]' : 'bg-transparent text-white/90 hover:bg-white/5'}`}
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
                                ? 'border-[#00ffcc]/25'
                                : item.tone === 'settings'
                                  ? 'border-blue-400/20'
                                  : 'border-white/8';

                              return (
                                <button
                                  key={item.id}
                                  ref={(node) => { buttonRefs.current[item.id] = node; }}
                                  onFocus={() => setFocusedEntryId(item.id)}
                                  onClick={() => onActivate(item)}
                                  className={`w-full rounded-[22px] border px-4 py-3 text-right transition-all ${toneClass} ${isFocused ? 'bg-[#00ffcc]/16 text-white shadow-[0_0_28px_rgba(0,255,204,0.18)]' : isActive ? 'bg-[#00ffcc]/10 text-white' : 'bg-black/10 text-white/85 hover:bg-white/5'}`}
                                >
                                  <div className="flex items-start gap-3">
                                    <span className={`mt-1 inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 ${isFocused || isActive ? 'bg-[#00ffcc]/20 text-[#7debd6]' : 'bg-white/5 text-white/60'}`}>
                                      {item.icon}
                                    </span>
                                    <div className="flex-1">
                                      <div className="flex items-center justify-between gap-3">
                                        <span className="text-base font-semibold">{item.label}</span>
                                        {isActive && <span className="rounded-full border border-[#00ffcc]/25 bg-[#00ffcc]/10 px-2 py-1 text-[10px] tracking-[0.2em] text-[#7debd6] uppercase">Live</span>}
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
