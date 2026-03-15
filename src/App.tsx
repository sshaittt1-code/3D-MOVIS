import React, { useState, useEffect, useRef, Suspense, useMemo, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Text, SpotLight } from '@react-three/drei';
import * as THREE from 'three';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Settings, Film, X, Loader2, Eye, Clock3 } from 'lucide-react';
import { App as CapApp } from '@capacitor/app';
import { textureManager } from './utils/TextureManager';
import { applyCatalogFilters, getApiYearFilter, getUniqueGenres, type LibrarySection, type SortMode, type YearFilter } from './utils/catalog';
import { isRemoteVersionNewer } from './utils/version';
import { buildMediaKey, createDefaultMediaStateEntry, MEDIA_STATE_STORAGE_KEY, migrateLegacyMediaState, type MediaStateEntry, type WatchStatus, updateProgressState } from './utils/mediaState';
import { findNextEpisodeInSeason, findNextSeason, shouldPrepareNextEpisode } from './utils/nextEpisode';
import { readAutoPlayNextEpisode, writeAutoPlayNextEpisode } from './utils/playerSettings';
import { SideMenu } from './components/SideMenu';
import { PosterContextMenu } from './components/PosterContextMenu';
import { AppSettingsPanel } from './components/AppSettingsPanel';
import { CinemaGate } from './components/CinemaGate';
import { buildSideMenuGroups, getActiveMenuItemId, type FeedCategory, type SettingsPanel, type SideMenuItem } from './utils/menuConfig';
import { safeGetJson, safeGetString, safeParseJson, safeRemove, safeSetJson, safeSetString } from './utils/safeStorage';
import { buildCategoryCacheKey, getCategoryCacheEntry, writeCategoryCacheEntry } from './utils/categoryCache';
import { DEFAULT_POSTER_BATCH_SIZE, POSTER_BATCH_SIZE_OPTIONS, readPosterBatchSize, writePosterBatchSize } from './utils/posterBatchSettings';
import { LONG_PRESS_DURATION_MS, classifyPressDuration } from './utils/longPress';
import { applyEditingKeyToInput, isEditableTextTarget } from './utils/keyboardActions';
import { normalizeSearchText, rankSearchResults, shouldTriggerPredictiveSearch } from './utils/searchNormalize';
import { NativePlayer } from './utils/nativePlayer';
import {
  buildLoadMorePageKey,
  canTriggerLoadMoreForPage,
  isCurrentLoadMoreRequest,
  shouldAdvanceContentPage
} from './utils/corridorPagination';
import {
  buildPosterLayout,
  CORRIDOR_INITIAL_CAMERA_Z,
  decorateCorridorItems,
  getCorridorRenderAheadCount,
  getLastPosterZ,
  getNearEndTriggerZ,
  getRenderedPosterLayout
} from './utils/corridorEngine';
import {
  FALLBACK_LIBRARY,
  getCatalogFallbackMediaType,
  mergeCorridorItems,
  normalizeCatalogPage,
  type CatalogPageResult,
  type CorridorItem,
  normalizeCatalogResponse,
  type FeedTarget,
  type NavContext
} from './utils/contentModel';
import {
  buildRootRequestKey,
  getActiveGenreFilterForSection,
  getFeedTargetForSection,
  resolveRootRouteState
} from './utils/corridorFeed';
import { shouldHandleGlobalTvBack } from './utils/tvNavigation';
import {
  DEFAULT_ROOT_CATALOG_STATE,
  resolveAppBackAction,
  resolveAppShellLayer
} from './utils/appShell';

// --- API Helpers ---
const API_BASE = import.meta.env.VITE_API_BASE || import.meta.env.VITE_API_BASE_URL || 'https://threed-movis.onrender.com';
const LAST_GOOD_FEED_STORAGE_KEY = 'last_good_feed_v1';
const isTvSelectKey = (e: KeyboardEvent) =>
  e.key === 'Enter' || e.key === 'Select' || e.keyCode === 23;

const isTvNavigationKey = (e: KeyboardEvent) =>
  ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) || isTvSelectKey(e);

const blurActiveElement = () => {
  const activeElement = document.activeElement as HTMLElement | null;
  activeElement?.blur?.();
};

const stopTvEvent = (e: KeyboardEvent) => {
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation?.();
};

const isUiScopeTarget = (target: EventTarget | null) =>
  typeof Element !== 'undefined' && target instanceof Element && !!target.closest('[data-tv-scope="ui"]');

const hasLocalBackHandlerTarget = (target: EventTarget | null) =>
  typeof Element !== 'undefined' && target instanceof Element && !!target.closest('[data-tv-back-scope="local"]');

const fetchApiJson = async <T = any>(path: string, init: RequestInit = {}): Promise<T> => {
  const sessionStr = safeGetString(localStorage, 'tg_session');
  const headers = new Headers(init.headers ?? {});
  if (sessionStr && !headers.has('x-tg-session')) {
    headers.set('x-tg-session', sessionStr);
  }
  const response = await fetch(path, { ...init, headers });
  const bodyText = await response.text();
  const trimmedBody = bodyText.trim();
  const parsedBody = trimmedBody && !trimmedBody.startsWith('<')
    ? safeParseJson<Record<string, unknown>>(bodyText, {})
    : {};
  if (!response.ok) {
    throw new Error(typeof parsedBody.error === 'string' ? parsedBody.error : bodyText || `Request failed with ${response.status}`);
  }
  if (!trimmedBody) return {} as T;
  if (trimmedBody.startsWith('<')) throw new Error('API returned HTML. Check API Base URL.');
  return safeParseJson<T>(bodyText, {} as T);
};

const buildApiUrl = (base: string, path: string) => `${base.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;

type LastGoodFeedMap = Partial<Record<FeedTarget, CatalogPageResult>>;

const readLastGoodFeedMap = (): LastGoodFeedMap => {
  if (typeof localStorage === 'undefined') return {};
  return safeGetJson<LastGoodFeedMap>(localStorage, LAST_GOOD_FEED_STORAGE_KEY, {});
};

const readInitialFeedItems = (target: FeedTarget): CorridorItem[] => {
  const lastGood = readLastGoodFeedMap()[target];
  if (Array.isArray(lastGood?.items) && lastGood.items.length > 0) {
    return normalizeCatalogPage(lastGood.items, getCatalogFallbackMediaType(target));
  }
  return FALLBACK_LIBRARY[target];
};

const writeLastGoodFeedPage = (target: FeedTarget, page: CatalogPageResult) => {
  if (typeof localStorage === 'undefined' || !Array.isArray(page.items) || page.items.length === 0) return;
  const current = readLastGoodFeedMap();
  safeSetJson(localStorage, LAST_GOOD_FEED_STORAGE_KEY, {
    ...current,
    [target]: {
      items: page.items,
      hasMore: page.hasMore,
      storedAt: Date.now()
    }
  });
};

const SETTINGS_TABS: Array<{ id: SettingsPanel; label: string }> = [
  { id: 'general', label: 'כללי' },
  { id: 'telegram', label: 'טלגרם' },
  { id: 'updates', label: 'עדכונים' }
];

const WatchStatusChip = ({ status }: { status: WatchStatus }) => {
  if (status === 'unwatched') return null;
  const Icon = status === 'watched' ? Eye : Clock3;
  const label = status === 'watched' ? 'נצפה' : 'בתהליך צפייה';
  const tone = status === 'watched'
    ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200'
    : 'border-amber-400/40 bg-amber-500/15 text-amber-100';

  return (
    <div className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold ${tone}`}>
      <Icon size={16} />
      <span>{label}</span>
    </div>
  );
};

type PreparedPlayback = {
  title: string;
  subtitleUrl?: string;
  mediaItem: any;
  sourceKey: string;
  streamUrl: string;
  downloadUrl: string;
  fileSizeBytes: number;
  mimeType?: string;
  fileName?: string;
  durationSeconds: number;
  cachePath: string;
  cacheUri?: string;
  resumePositionSeconds: number;
  peerId: string;
  messageId: number;
};

type ActivePlayback = PreparedPlayback & {
  url: string;
};

type TelegramSourceInfo = {
  sourceKey?: string;
  fileName?: string;
  fileSizeBytes?: number;
  mimeType?: string;
  durationSeconds?: number;
  streamUrl?: string;
  downloadUrl?: string;
};

const formatBytes = (bytes: number) => {
  if (!bytes) return '0 MB';
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const toBase64 = (buffer: ArrayBuffer) => {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
};

// --- 3D Components ---
const TVController = ({ posterLayout, isLocked, onPosterSelect, onPosterLongPress, onHeartToggle, setFocusedId, setFocusedHeartId, isAnyModalOpen, selectedMovie, lastPosterZ, nearEndTriggerKey, cameraResetKey, onNearEnd, onCameraMove }: any) => {
  const { camera } = useThree();
  const [targetPos, setTargetPos] = useState(new THREE.Vector3(0, 1.6, CORRIDOR_INITIAL_CAMERA_Z));
  const focusedMovieRef = useRef<any>(null);
  const focusedHeartRef = useRef<string | null>(null);
  const lastNearEndTriggerKeyRef = useRef<string | null>(null);
  const STEP_SIZE = 0.8;
  const ROTATION_SPEED = 0.012;
  
  const keys = useRef<{ left: boolean; right: boolean }>({ left: false, right: false });
  const targetRotY = useRef(0);
  const raycaster = useRef(new THREE.Raycaster());
  const centerPointer = useRef(new THREE.Vector2(0, 0));
  const selectKeyDownAtRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef(false);
  const longPressTimeoutRef = useRef<number | null>(null);
  const clearLongPress = useCallback(() => {
    if (longPressTimeoutRef.current) {
      window.clearTimeout(longPressTimeoutRef.current);
      longPressTimeoutRef.current = null;
    }
    selectKeyDownAtRef.current = null;
    longPressTriggeredRef.current = false;
  }, []);

  useEffect(() => {
    if (isLocked && !isAnyModalOpen && !selectedMovie) return;
    keys.current = { left: false, right: false };
    clearLongPress();
  }, [clearLongPress, isAnyModalOpen, isLocked, selectedMovie]);

  useEffect(() => {
    const handleInput = (e: KeyboardEvent) => {
      if (isUiScopeTarget(e.target)) {
        keys.current = { left: false, right: false };
        clearLongPress();
        return;
      }
      if (!isLocked || isAnyModalOpen || !!selectedMovie) return;
      if (isTvNavigationKey(e)) stopTvEvent(e);
      if (e.key === 'ArrowUp') {
        setTargetPos(p => new THREE.Vector3(p.x, p.y, p.z - STEP_SIZE));
        targetRotY.current = 0;
      } else if (e.key === 'ArrowDown') {
        setTargetPos(p => new THREE.Vector3(p.x, p.y, Math.min(p.z + STEP_SIZE, CORRIDOR_INITIAL_CAMERA_Z + 3)));
        targetRotY.current = 0;
      } else if (e.key === 'ArrowLeft') {
        keys.current.left = true;
      } else if (e.key === 'ArrowRight') {
        keys.current.right = true;
      } else if (isTvSelectKey(e)) {
        if (e.repeat || selectKeyDownAtRef.current !== null) return;
        selectKeyDownAtRef.current = Date.now();
        longPressTriggeredRef.current = false;
        if (!focusedHeartRef.current && focusedMovieRef.current) {
          longPressTimeoutRef.current = window.setTimeout(() => {
            if (!focusedMovieRef.current) return;
            longPressTriggeredRef.current = true;
            onPosterLongPress(focusedMovieRef.current);
          }, LONG_PRESS_DURATION_MS);
        }
      }
    };
    const handleInputUp = (e: KeyboardEvent) => {
      if (isUiScopeTarget(e.target)) {
        keys.current = { left: false, right: false };
        clearLongPress();
        return;
      }
      if (e.key === 'ArrowLeft') keys.current.left = false;
      else if (e.key === 'ArrowRight') keys.current.right = false;
      else if (isTvSelectKey(e)) {
        if (selectKeyDownAtRef.current === null) return;
        const duration = selectKeyDownAtRef.current ? Date.now() - selectKeyDownAtRef.current : 0;
        const pressKind = classifyPressDuration(duration);
        const didLongPress = longPressTriggeredRef.current || pressKind === 'long';
        if (!didLongPress) {
          if (focusedHeartRef.current) onHeartToggle(focusedHeartRef.current);
          else if (focusedMovieRef.current) onPosterSelect(focusedMovieRef.current);
        }
        clearLongPress();
      }
    };
    window.addEventListener('keydown', handleInput, true);
    window.addEventListener('keyup', handleInputUp, true);
    return () => {
      clearLongPress();
      window.removeEventListener('keydown', handleInput, true);
      window.removeEventListener('keyup', handleInputUp, true);
    };
  }, [clearLongPress, isLocked, onPosterLongPress, onPosterSelect, onHeartToggle, isAnyModalOpen, selectedMovie]);

  useEffect(() => {
    setTargetPos(new THREE.Vector3(0, 1.6, CORRIDOR_INITIAL_CAMERA_Z));
    targetRotY.current = 0;
  }, [cameraResetKey]);

  useEffect(() => {
    if (!nearEndTriggerKey) {
      lastNearEndTriggerKeyRef.current = null;
    }
  }, [nearEndTriggerKey]);

  useFrame((state) => {
    if (isLocked && !isAnyModalOpen && !selectedMovie) {
      if (keys.current.left) targetRotY.current += ROTATION_SPEED;
      if (keys.current.right) targetRotY.current -= ROTATION_SPEED;
      targetRotY.current = Math.max(-Math.PI / 1.8, Math.min(Math.PI / 1.8, targetRotY.current));
      camera.position.lerp(targetPos, 0.1);
      const targetQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, targetRotY.current, 0));
      camera.quaternion.slerp(targetQuat, 0.15);
      onCameraMove?.(camera.position.z);

      if (nearEndTriggerKey) {
        const nearEndTriggerZ = getNearEndTriggerZ(lastPosterZ);
        if (nearEndTriggerZ !== null && camera.position.z <= nearEndTriggerZ && lastNearEndTriggerKeyRef.current !== nearEndTriggerKey) {
          lastNearEndTriggerKeyRef.current = nearEndTriggerKey;
          onNearEnd?.();
        }
      }

      raycaster.current.setFromCamera(centerPointer.current, camera);
      const intersects = raycaster.current.intersectObjects(state.scene.children, true);
      const heartHit = intersects.find(i => i.object.name === 'heart_mesh' && i.object.userData.uniqueId);
      const posterHit = intersects.find(i => i.object.name === 'poster_mesh' && i.object.userData.uniqueId);

      if (heartHit) {
        const id = heartHit.object.userData.uniqueId;
        focusedHeartRef.current = id;
        focusedMovieRef.current = null;
        setFocusedHeartId(id);
        setFocusedId(null);
      } else if (posterHit) {
        const id = posterHit.object.userData.uniqueId;
        const matched = posterLayout.find((p: any) => p.movie.uniqueId === id);
        if (matched) {
          focusedMovieRef.current = matched.movie;
          focusedHeartRef.current = null;
          setFocusedId(id);
          setFocusedHeartId(null);
        }
      } else {
        focusedMovieRef.current = null;
        focusedHeartRef.current = null;
        setFocusedId(null);
        setFocusedHeartId(null);
      }
    }
  });

  return null;
};

const Poster = ({ movie, position, rotation, isFocused, isFavorited, isHeartFocused, watchStatus }: any) => {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  const [showText, setShowText] = useState(false);
  const groupRef = useRef<THREE.Group>(null!);
  const fetchAttempted = useRef(false);

  useEffect(() => {
    fetchAttempted.current = false;
    setTexture(movie.poster ? textureManager.getTexture(movie.poster) : null);
  }, [movie.poster]);

  useFrame((state) => { 
    if (!groupRef.current) return;
    const targetScale = isFocused ? 1.4 : 1; 
    groupRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, 1), 0.1); 
    const distZ = state.camera.position.z - groupRef.current.position.z;
    const isVisible = distZ > -15 && distZ < 35; 
    const isTextVisible = isVisible && distZ < 15;
    groupRef.current.visible = isVisible;
    if (showText !== isTextVisible) setShowText(isTextVisible);
    if (isVisible && !fetchAttempted.current) {
      fetchAttempted.current = true;
      textureManager.loadTexture(movie.poster).then(tex => setTexture(tex)).catch(() => null);
    }
  });

  const heartColor = isFavorited ? '#ff3355' : isHeartFocused ? '#ff8899' : '#555555';
  const watchBadgeColor = watchStatus === 'watched' ? '#22c55e' : watchStatus === 'in_progress' ? '#f59e0b' : null;
  const watchBadgeGlyph = watchStatus === 'watched' ? '◉' : watchStatus === 'in_progress' ? '◷' : null;

  return (
    <group position={position} rotation={rotation} ref={groupRef}>
      <mesh name="poster_mesh" userData={{ uniqueId: movie.uniqueId }} position={[0, 0, 0.01]}>
        <planeGeometry args={[2.5, 3.75]} />
        <meshStandardMaterial map={texture} color={texture ? (isFocused ? '#ffffff' : '#acacac') : '#1c2730'} />
      </mesh>
      <mesh name="poster_mesh" userData={{ uniqueId: movie.uniqueId }} position={[0, 0, -0.02]}>
        <planeGeometry args={[2.6, 3.85]} />
        <meshBasicMaterial color={isFocused ? '#00ffcc' : '#111111'} />
      </mesh>
      <mesh name="heart_mesh" userData={{ uniqueId: movie.uniqueId }} position={[1.05, 2.05, 0.05]}>
        <circleGeometry args={[0.38, 16]} />
        <meshBasicMaterial color={heartColor} transparent opacity={0.85} />
      </mesh>
      {watchBadgeColor && (
        <mesh position={[-1.05, 2.05, 0.05]}>
          <circleGeometry args={[0.34, 16]} />
          <meshBasicMaterial color={watchBadgeColor} transparent opacity={0.88} />
        </mesh>
      )}
      {watchBadgeGlyph && showText && (
        <Text position={[-1.05, 2.05, 0.09]} fontSize={0.28} color="#04120f" anchorX="center" anchorY="middle">
          {watchBadgeGlyph}
        </Text>
      )}
      {showText && (
        <Text position={[1.05, 2.05, 0.09]} fontSize={0.42} color={heartColor} anchorX="center" anchorY="middle">
          {isFavorited ? '❤' : isHeartFocused ? '❤' : '♡'}
        </Text>
      )}
      {showText && (
        <Text position={[0, -2.4, 0.01]} fontSize={0.28} color={isFocused ? '#00ffcc' : '#ffffff'} anchorX="center" maxWidth={2.6} textAlign="center">
          {movie.title}
        </Text>
      )}
      {showText && isFocused && movie.rating > 0 && (
        <Text position={[0, -2.82, 0.01]} fontSize={0.26} color="#fbbf24" anchorX="center" anchorY="middle">
          {'★'.repeat(Math.round(movie.rating / 2))}{'☆'.repeat(5 - Math.round(movie.rating / 2))} {movie.rating.toFixed(1)}
        </Text>
      )}
      {isFocused && <SpotLight position={[0, 2, 3]} intensity={5} color="#00ffcc" angle={0.6} penumbra={0.5} />}
    </group>
  );
};

export default function App() {
  const [baseMovies, setBaseMovies] = useState<CorridorItem[]>(() => readInitialFeedItems('movies'));
  const [seriesItems, setSeriesItems] = useState<CorridorItem[]>(() => readInitialFeedItems('series'));
  const [israeliItems, setIsraeliItems] = useState<CorridorItem[]>(() => readInitialFeedItems('israeli'));
  const [selectedMovie, setSelectedMovie] = useState<CorridorItem | null>(null);
  const [isLocked, setIsLocked] = useState(true);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [focusedHeartId, setFocusedHeartId] = useState<string | null>(null);
  const [showCinemaScreen, setShowCinemaScreen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [navContext, setNavContext] = useState<NavContext>(null);
  const [librarySection, setLibrarySection] = useState<LibrarySection>(DEFAULT_ROOT_CATALOG_STATE.librarySection);
  const [sortMode, setSortMode] = useState<SortMode>(DEFAULT_ROOT_CATALOG_STATE.sortMode);
  const [yearFilter, setYearFilter] = useState<YearFilter>(DEFAULT_ROOT_CATALOG_STATE.yearFilter);
  const [seriesGenreFilter, setSeriesGenreFilter] = useState<string | null>(DEFAULT_ROOT_CATALOG_STATE.seriesGenreFilter);
  const [movieGenreId, setMovieGenreId] = useState<number | null>(DEFAULT_ROOT_CATALOG_STATE.movieGenreId);
  const [movieCategory, setMovieCategory] = useState<FeedCategory>(DEFAULT_ROOT_CATALOG_STATE.movieCategory);
  const [seriesCategory, setSeriesCategory] = useState<FeedCategory>(DEFAULT_ROOT_CATALOG_STATE.seriesCategory);
  const [israeliCategory, setIsraeliCategory] = useState<FeedCategory>(DEFAULT_ROOT_CATALOG_STATE.israeliCategory);
  const [settingsPanel, setSettingsPanel] = useState<SettingsPanel>('general');
  const [shuffleSeed, setShuffleSeed] = useState(() => Date.now());
  const [cameraZ, setCameraZ] = useState(2);
  const [isLoadingContent, setIsLoadingContent] = useState(false);

  const [contentPage, setContentPage] = useState(1);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [nearEndGeneration, setNearEndGeneration] = useState(0);

  const [mediaStateMap, setMediaStateMap] = useState<Record<string, MediaStateEntry>>(() => safeGetJson(localStorage, MEDIA_STATE_STORAGE_KEY, {}));
  const [autoPlayNextEpisode, setAutoPlayNextEpisode] = useState<boolean>(() => readAutoPlayNextEpisode(localStorage, true));
  const [posterBatchSize, setPosterBatchSize] = useState<number>(() => readPosterBatchSize(localStorage, DEFAULT_POSTER_BATCH_SIZE));

  const [apiBase, setApiBase] = useState(() => safeGetString(localStorage, 'api_base', API_BASE));
  const normalizedApiBase = useMemo(() => apiBase.replace(/\/$/, ''), [apiBase]);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [tgStatus, setTgStatus] = useState<'checking' | 'loggedOut' | 'phoneInput' | 'codeInput' | 'passwordInput' | 'loggedIn'>('checking');
  const [activeMedia, setActiveMedia] = useState<ActivePlayback | null>(null);

  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearchingTmdb, setIsSearchingTmdb] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [posterContextMovie, setPosterContextMovie] = useState<any>(null);

  const predictiveSearchRequestRef = useRef(0);
  const predictiveSearchAbortRef = useRef<AbortController | null>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchReturnToSidebarRef = useRef(false);
  const settingsReturnToSidebarRef = useRef(false);
  const mediaStateMapRef = useRef(mediaStateMap);

  useEffect(() => { mediaStateMapRef.current = mediaStateMap; safeSetJson(localStorage, MEDIA_STATE_STORAGE_KEY, mediaStateMap); }, [mediaStateMap]);

  const favorites = useMemo(() => Object.values(mediaStateMap).filter(e => e.favorite).map(e => e.snapshot), [mediaStateMap]);
  const watchHistory = useMemo(() => Object.values(mediaStateMap).filter(e => e.lastWatchedAt).sort((a,b) => (b.lastWatchedAt||0) - (a.lastWatchedAt||0)).map(e => e.snapshot), [mediaStateMap]);
  const shellSnapshot = useMemo(() => ({
    hasActiveMedia: Boolean(activeMedia),
    hasPosterContextMovie: Boolean(posterContextMovie),
    hasSelectedMovie: Boolean(selectedMovie),
    showCinemaScreen,
    showSearch,
    hasNavContext: Boolean(navContext),
    showSettings,
    isSidebarOpen: !isLocked
  }), [activeMedia, posterContextMovie, selectedMovie, showCinemaScreen, showSearch, navContext, showSettings, isLocked]);
  const activeShellLayer = useMemo(() => resolveAppShellLayer(shellSnapshot), [shellSnapshot]);
  const isAnyShellOverlayOpen = activeShellLayer !== 'corridor' && activeShellLayer !== 'sidebar';

  const handlePosterBatchSizeChange = useCallback((value: number) => {
    setPosterBatchSize(value);
    writePosterBatchSize(localStorage, value);
  }, []);

  const handleAutoPlayNextEpisodeChange = useCallback((value: boolean) => {
    setAutoPlayNextEpisode(value);
    writeAutoPlayNextEpisode(localStorage, value);
  }, []);

  const closeSettingsSurface = useCallback(() => {
    const shouldReturnToSidebar = settingsReturnToSidebarRef.current;
    settingsReturnToSidebarRef.current = false;
    setShowSettings(false);
    if (shouldReturnToSidebar) {
      setIsLocked(false);
    }
  }, []);

  const openSettingsPanel = useCallback((panel: SettingsPanel, options: { returnToSidebar?: boolean } = {}) => {
    setSettingsPanel(panel);
    setShowCinemaScreen(false);
    setShowSettings(true);
    settingsReturnToSidebarRef.current = Boolean(options.returnToSidebar);
    setIsLocked(true);
  }, []);

  const toggleFavoriteForItem = useCallback((item: CorridorItem, force?: boolean) => {
    const key = buildMediaKey(item);
    setMediaStateMap(prev => {
      const existing = prev[key] || createDefaultMediaStateEntry(item);
      return { ...prev, [key]: { ...existing, favorite: force ?? !existing.favorite, snapshot: { ...existing.snapshot, ...item } } };
    });
  }, []);

  const handleHeartToggle = (uniqueId: string) => {
    const item = displayMoviesRef.current.find(m => m.uniqueId === uniqueId);
    if (item) toggleFavoriteForItem(item);
  };

  const closePlayer = async () => {
    await NativePlayer.close().catch(() => null);
    setActiveMedia(null);
  };

  // --- CONTENT LOADING ENGINE ---

  const contentFetchAbortRef = useRef<AbortController | null>(null);
  const loadMoreAbortRef = useRef<AbortController | null>(null);
  const activeRootRequestKeyRef = useRef('');
  const activeLoadMorePageKeyRef = useRef<string | null>(null);
  const prefetchedPageKeysRef = useRef<Set<string>>(new Set());
  const pendingCategoryRequestsRef = useRef<Map<string, Promise<CatalogPageResult>>>(new Map());
  const backgroundWarmupTargetsRef = useRef<Set<FeedTarget>>(new Set());

  const setItemsForTarget = useCallback((target: FeedTarget, items: CorridorItem[]) => {
    if (target === 'movies') {
      setBaseMovies(items);
      return;
    }
    if (target === 'series') {
      setSeriesItems(items);
      return;
    }
    setIsraeliItems(items);
  }, []);

  const getItemsForTarget = useCallback((target: FeedTarget) => {
    if (target === 'movies') return baseMovies;
    if (target === 'series') return seriesItems;
    return israeliItems;
  }, [baseMovies, seriesItems, israeliItems]);

  const getCategorySeed = useCallback((category: FeedCategory, page = 1) => (
    category === 'random' ? shuffleSeed + page : undefined
  ), [shuffleSeed]);

  const readCachedCategoryPage = useCallback((
    target: FeedTarget,
    category: FeedCategory,
    options: { genreId?: number | null; year?: YearFilter; page?: number } = {}
  ) => {
    const { genreId, year, page = 1 } = options;
    const seed = getCategorySeed(category, page);
    const cacheKey = buildCategoryCacheKey({
      target,
      category,
      genreId,
      genreLabel: null,
      year: year !== 'all' ? year : null,
      israeliOnly: target === 'israeli',
      page,
      batchSize: posterBatchSize,
      seed
    });

    const cached = getCategoryCacheEntry(localStorage, cacheKey, Date.now(), undefined, {
      category,
      year: year !== 'all' ? year : null
    });

    if (!cached) return null;
    const items = normalizeCatalogPage(cached.items, getCatalogFallbackMediaType(target));
    if (items.length === 0) return null;

    return {
      ...cached,
      items,
      hasMore: Boolean(cached.hasMore)
    };
  }, [getCategorySeed, posterBatchSize]);

  const prefetchPostersForItems = useCallback((items: CorridorItem[], priorityCount = 10) => {
    const validItems = items.filter((item) => item?.poster);
    if (validItems.length === 0) return;

    const priorityUrls = validItems.slice(0, priorityCount).map((item) => item.poster);
    const secondaryUrls = validItems
      .slice(priorityCount, priorityCount + Math.max(10, Math.ceil(posterBatchSize / 2)))
      .map((item) => item.poster);

    void textureManager.prefetchPriority(priorityUrls, secondaryUrls, 6);
  }, [posterBatchSize]);

  const hydrateTargetFromLocalSources = useCallback((
    target: FeedTarget,
    category: FeedCategory,
    options: { genreId?: number | null; year?: YearFilter; page?: number } = {}
  ) => {
    const cached = readCachedCategoryPage(target, category, options);
    if (cached?.items?.length) {
      setItemsForTarget(target, cached.items);
      return cached.items;
    }

    const lastGood = readLastGoodFeedMap()[target];
    const lastGoodItems = normalizeCatalogPage(lastGood?.items ?? [], getCatalogFallbackMediaType(target));
    if (lastGoodItems.length > 0) {
      setItemsForTarget(target, lastGoodItems);
      return lastGoodItems;
    }

    const fallbackItems = FALLBACK_LIBRARY[target];
    if (fallbackItems.length > 0) {
      setItemsForTarget(target, fallbackItems);
      return fallbackItems;
    }

    return [] as CorridorItem[];
  }, [readCachedCategoryPage, setItemsForTarget]);

  const fetchCategoryContent = useCallback(async (
    target: FeedTarget,
    category: FeedCategory,
    options: { genreId?: number | null; year?: YearFilter; page?: number; signal?: AbortSignal; prefetchPosters?: boolean } = {}
  ) => {
    const { genreId, year, page = 1, signal, prefetchPosters = true } = options;
    const seed = getCategorySeed(category, page);

    const cacheKey = buildCategoryCacheKey({
      target,
      category,
      genreId,
      genreLabel: null,
      year: year !== 'all' ? year : null,
      israeliOnly: target === 'israeli',
      page,
      batchSize: posterBatchSize,
      seed
    });

    const cached = readCachedCategoryPage(target, category, { genreId, year, page });
    if (cached) {
      if (prefetchPosters) {
        prefetchPostersForItems(cached.items);
      }
      return { items: cached.items, hasMore: cached.hasMore, fromCache: true };
    }

    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    if (pendingCategoryRequestsRef.current.has(cacheKey)) {
      return pendingCategoryRequestsRef.current.get(cacheKey)!;
    }

    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('page_size', String(posterBatchSize));
    params.set('category', category);
    if (genreId) params.set('genre_id', String(genreId));
    if (year && year !== 'all') params.set('year', String(year).replace(/[^0-9]/g, '').slice(0, 4));
    if (seed) params.set('seed', String(seed));

    const endpoint = target === 'movies' ? '/api/movies' : target === 'series' ? '/api/series' : '/api/israeli';
    const url = buildApiUrl(normalizedApiBase, `${endpoint}?${params.toString()}`);

    const requestPromise = (async () => {
      const data = await fetchApiJson<any>(url, { signal });
      const { items, hasMore } = normalizeCatalogResponse(data, target);

      writeCategoryCacheEntry(localStorage, cacheKey, { items, hasMore });
      if (prefetchPosters) {
        prefetchPostersForItems(items);
      }
      return { items, hasMore, fromCache: false };
    })();

    pendingCategoryRequestsRef.current.set(cacheKey, requestPromise);
    try {
      return await requestPromise;
    } finally {
      pendingCategoryRequestsRef.current.delete(cacheKey);
    }
  }, [getCategorySeed, normalizedApiBase, posterBatchSize, prefetchPostersForItems, readCachedCategoryPage]);

  const prefetchNextCategoryPage = useCallback(async (
    target: FeedTarget,
    category: FeedCategory,
    options: { genreId?: number | null; year?: YearFilter; page: number }
  ) => {
    const { genreId, year, page } = options;
    const seed = getCategorySeed(category, page);
    const cacheKey = buildCategoryCacheKey({
      target,
      category,
      genreId,
      genreLabel: null,
      year: year !== 'all' ? year : null,
      israeliOnly: target === 'israeli',
      page,
      batchSize: posterBatchSize,
      seed
    });

    if (prefetchedPageKeysRef.current.has(cacheKey)) return;
    prefetchedPageKeysRef.current.add(cacheKey);

    try {
      await fetchCategoryContent(target, category, { genreId, year, page, prefetchPosters: true });
    } catch (error: any) {
      if (error?.name !== 'AbortError') {
        prefetchedPageKeysRef.current.delete(cacheKey);
      }
    }
  }, [fetchCategoryContent, getCategorySeed, posterBatchSize]);

  const getCurrentRootContext = useCallback(() => {
    const target = getFeedTargetForSection(librarySection);
    if (target === 'movies') {
      return { target, category: movieCategory, genreId: movieGenreId, year: yearFilter };
    }
    if (target === 'series') {
      return { target, category: seriesCategory, genreId: null, year: yearFilter };
    }
    return { target, category: israeliCategory, genreId: null, year: yearFilter };
  }, [librarySection, movieCategory, movieGenreId, seriesCategory, israeliCategory, yearFilter]);

  const getCurrentRootRequestKey = useCallback(() => {
    const { target, category, genreId, year } = getCurrentRootContext();
    const currentSeed = category === 'random' ? getCategorySeed(category) : undefined;
    return buildRootRequestKey({ target, category, genreId, year, seed: currentSeed });
  }, [getCategorySeed, getCurrentRootContext]);

  const loadContentForCurrentSection = useCallback(async () => {
    if (showSearch || navContext) return;
    if (librarySection === 'favorites' || librarySection === 'history') return;

    const { target, category, genreId, year } = getCurrentRootContext();
    const rootRequestKey = getCurrentRootRequestKey();
    activeRootRequestKeyRef.current = rootRequestKey;
    loadMoreAbortRef.current?.abort();
    loadMoreAbortRef.current = null;
    activeLoadMorePageKeyRef.current = null;
    prefetchedPageKeysRef.current.clear();
    setIsLoadingMore(false);
    setNearEndGeneration((current) => current + 1);

    let visibleItems = getItemsForTarget(target);
    if (visibleItems.length === 0) {
      visibleItems = hydrateTargetFromLocalSources(target, category, { genreId, year, page: 1 });
    }

    setIsLoadingContent(visibleItems.length === 0);
    setFetchError(null);
    contentFetchAbortRef.current?.abort();
    const controller = new AbortController();
    contentFetchAbortRef.current = controller;

    try {
      const result = await fetchCategoryContent(target, category, { genreId, year, signal: controller.signal });
      if (activeRootRequestKeyRef.current !== rootRequestKey) {
        return;
      }

      const nextItems = result.items.length > 0 ? result.items : visibleItems;
      setItemsForTarget(target, nextItems);
      setHasMore(result.hasMore);
      setContentPage(1);
      if (result.items.length > 0) {
        writeLastGoodFeedPage(target, result);
      }
      if (result.hasMore) {
        void prefetchNextCategoryPage(target, category, { genreId, year, page: 2 });
      }
    } catch (e: any) {
      if (e.name !== 'AbortError' && activeRootRequestKeyRef.current === rootRequestKey) {
        console.error('Content fetch failed:', e);
        setFetchError(e.message || 'Failed to load content');
        if (visibleItems.length === 0) {
          const fallbackItems = hydrateTargetFromLocalSources(target, category, { genreId, year, page: 1 });
          if (fallbackItems.length > 0) {
            setItemsForTarget(target, fallbackItems);
          }
        }
      }
    } finally {
      if (activeRootRequestKeyRef.current === rootRequestKey) {
        setIsLoadingContent(false);
      }
    }
  }, [showSearch, navContext, librarySection, getCurrentRootContext, getCurrentRootRequestKey, getItemsForTarget, hydrateTargetFromLocalSources, fetchCategoryContent, setItemsForTarget, prefetchNextCategoryPage]);

  useEffect(() => {
    loadContentForCurrentSection();
    return () => {
      contentFetchAbortRef.current?.abort();
    };
  }, [loadContentForCurrentSection]);

  useEffect(() => {
    if (showSearch || navContext || isLoadingContent) return;
    const activeTarget = getFeedTargetForSection(librarySection);
    const targets = (['movies', 'series', 'israeli'] as FeedTarget[]).filter((target) => target !== activeTarget);
    const pendingTargets = targets.filter((target) => !backgroundWarmupTargetsRef.current.has(target));
    if (pendingTargets.length === 0) return;

    const timer = window.setTimeout(() => {
      pendingTargets.forEach((target) => backgroundWarmupTargetsRef.current.add(target));
      void Promise.allSettled(pendingTargets.map((target) =>
        fetchCategoryContent(target, 'popular', { page: 1, prefetchPosters: false }).catch((error) => {
          backgroundWarmupTargetsRef.current.delete(target);
          throw error;
        })
      ));
    }, 500);

    return () => window.clearTimeout(timer);
  }, [showSearch, navContext, isLoadingContent, librarySection, fetchCategoryContent]);

  useEffect(() => {
    loadMoreAbortRef.current?.abort();
    loadMoreAbortRef.current = null;
    activeLoadMorePageKeyRef.current = null;
    setCameraZ(CORRIDOR_INITIAL_CAMERA_Z);
    setContentPage(1);
    setHasMore(true);
    setIsLoadingMore(false);
    setNearEndGeneration((current) => current + 1);
    setFetchError(null);
    setFocusedId(null);
    setFocusedHeartId(null);
  }, [librarySection, movieCategory, seriesCategory, israeliCategory, movieGenreId, seriesGenreFilter, yearFilter, shuffleSeed]);

  const loadMoreContent = useCallback(async () => {
    if (isLoadingMore || !hasMore || showSearch || navContext) return;
    if (librarySection === 'favorites' || librarySection === 'history') return;

    const { target, category, genreId, year } = getCurrentRootContext();
    const rootRequestKey = getCurrentRootRequestKey();
    if (activeRootRequestKeyRef.current && activeRootRequestKeyRef.current !== rootRequestKey) return;

    const nextPage = contentPage + 1;
    const nextPageKey = buildLoadMorePageKey(rootRequestKey, nextPage);
    if (!canTriggerLoadMoreForPage(null, activeLoadMorePageKeyRef.current, nextPageKey)) return;

    const controller = new AbortController();
    loadMoreAbortRef.current?.abort();
    loadMoreAbortRef.current = controller;
    activeLoadMorePageKeyRef.current = nextPageKey;
    setIsLoadingMore(true);

    try {
      const result = await fetchCategoryContent(target, category, { genreId, year, page: nextPage, signal: controller.signal });
      if (!isCurrentLoadMoreRequest({
        activeRootRequestKey: activeRootRequestKeyRef.current,
        requestRootRequestKey: rootRequestKey,
        activeLoadMorePageKey: activeLoadMorePageKeyRef.current,
        requestPageKey: nextPageKey
      })) {
        return;
      }

      const appendedCount = result.items.length;
      if (appendedCount > 0) {
        if (target === 'movies') {
          setBaseMovies((prev) => mergeCorridorItems(prev, result.items));
        } else if (target === 'series') {
          setSeriesItems((prev) => mergeCorridorItems(prev, result.items));
        } else {
          setIsraeliItems((prev) => mergeCorridorItems(prev, result.items));
        }
      }

      setHasMore(result.hasMore);

      if (shouldAdvanceContentPage(appendedCount)) {
        setContentPage(nextPage);
      } else if (result.hasMore) {
        setNearEndGeneration((current) => current + 1);
      }

      activeLoadMorePageKeyRef.current = null;

      if (result.hasMore && shouldAdvanceContentPage(appendedCount)) {
        void prefetchNextCategoryPage(target, category, { genreId, year, page: nextPage + 1 });
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        console.error('Load more failed:', e);
        if (activeLoadMorePageKeyRef.current === nextPageKey) {
          activeLoadMorePageKeyRef.current = null;
        }
        setNearEndGeneration((current) => current + 1);
      } else if (activeLoadMorePageKeyRef.current === nextPageKey) {
        activeLoadMorePageKeyRef.current = null;
      }
    } finally {
      if (loadMoreAbortRef.current === controller) {
        loadMoreAbortRef.current = null;
      }
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, hasMore, showSearch, navContext, librarySection, contentPage, getCurrentRootContext, getCurrentRootRequestKey, fetchCategoryContent, prefetchNextCategoryPage]);

  const handleCategoryNavigation = useCallback((item: SideMenuItem) => {
    if (item.kind !== 'route') return;

    const route = item.route;
    setNavContext(null);
    setShowSearch(false);
    setShowSettings(false);
    setShowCinemaScreen(false);
    setPosterContextMovie(null);
    searchReturnToSidebarRef.current = false;
    settingsReturnToSidebarRef.current = false;

    if (route.target === 'search') {
      searchReturnToSidebarRef.current = true;
      setShowSearch(true);
      setIsLocked(true);
      return;
    }

    if (route.target === 'favorites') {
      setLibrarySection('favorites');
      setIsLocked(true);
      return;
    }

    const nextRouteState = resolveRootRouteState(route);
    if (nextRouteState) {
      setLibrarySection(nextRouteState.librarySection);
      if (nextRouteState.movieCategory) setMovieCategory(nextRouteState.movieCategory);
      if (nextRouteState.seriesCategory) setSeriesCategory(nextRouteState.seriesCategory);
      if (nextRouteState.israeliCategory) setIsraeliCategory(nextRouteState.israeliCategory);
      setMovieGenreId(nextRouteState.movieGenreId);
      setSeriesGenreFilter(nextRouteState.seriesGenreFilter);
      setYearFilter(nextRouteState.yearFilter);
      setContentPage(1);
      setHasMore(true);
      setFetchError(null);
      setFocusedId(null);
      setFocusedHeartId(null);
      prefetchedPageKeysRef.current.clear();
      if (nextRouteState.refreshShuffle) setShuffleSeed(Date.now());
      setIsLocked(true);
    }
  }, []);

  // --- SEARCH ENGINE ---

  const abortPendingSearch = useCallback(() => {
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
      searchDebounceRef.current = null;
    }
    predictiveSearchAbortRef.current?.abort();
    predictiveSearchAbortRef.current = null;
  }, []);

  const resetSearchState = useCallback((shouldHide = false) => {
    predictiveSearchRequestRef.current += 1;
    abortPendingSearch();
    if (shouldHide) setShowSearch(false);
    setSearchQuery('');
    setSearchResults([]);
    setIsSearchingTmdb(false);
    setSearchError(null);
  }, [abortPendingSearch]);

  const closeSearchSurface = useCallback(() => {
    const shouldReturnToSidebar = searchReturnToSidebarRef.current;
    searchReturnToSidebarRef.current = false;
    resetSearchState(true);
    if (shouldReturnToSidebar) {
      setIsLocked(false);
    }
  }, [resetSearchState]);

  useEffect(() => {
    if (!showSearch) {
      abortPendingSearch();
    }
    return () => abortPendingSearch();
  }, [showSearch, abortPendingSearch]);

  const runPredictiveSearch = useCallback(async (query: string, requestId: number) => {
    const trimmedQuery = query.trim();
    const normalized = normalizeSearchText(trimmedQuery);

    if (!trimmedQuery) {
      setSearchResults([]);
      setIsSearchingTmdb(false);
      setSearchError(null);
      return;
    }

    const localMatches = rankSearchResults([...favorites, ...watchHistory, ...baseMovies, ...seriesItems, ...israeliItems], trimmedQuery);
    setSearchResults(localMatches.slice(0, 15));
    setSearchError(null);

    if (!shouldTriggerPredictiveSearch(normalized)) {
      setIsSearchingTmdb(false);
      return;
    }

    abortPendingSearch();
    const controller = new AbortController();
    predictiveSearchAbortRef.current = controller;
    setIsSearchingTmdb(true);

    try {
      const data = await fetchApiJson(buildApiUrl(normalizedApiBase, `/api/search?q=${encodeURIComponent(trimmedQuery)}`), { signal: controller.signal });

      if (requestId !== predictiveSearchRequestRef.current) return;

      const remoteResults = Array.isArray(data.results) ? data.results : [];
      const combined = rankSearchResults([...localMatches, ...remoteResults], trimmedQuery);
      setSearchResults(combined.slice(0, 30));
      setSearchError(null);
    } catch (e: any) {
      if (e.name === 'AbortError') return;
      if (requestId !== predictiveSearchRequestRef.current) return;
      console.error('Search failed', e);
      setSearchError('שגיאה בחיפוש');
    } finally {
      if (requestId === predictiveSearchRequestRef.current) {
        setIsSearchingTmdb(false);
        if (predictiveSearchAbortRef.current === controller) {
          predictiveSearchAbortRef.current = null;
        }
      }
    }
  }, [favorites, watchHistory, baseMovies, seriesItems, israeliItems, normalizedApiBase, abortPendingSearch]);

  useEffect(() => {
    if (!showSearch) return;

    const requestId = ++predictiveSearchRequestRef.current;
    const trimmedQuery = searchQuery.trim();

    if (!trimmedQuery) {
      abortPendingSearch();
      setSearchResults([]);
      setIsSearchingTmdb(false);
      setSearchError(null);
      return;
    }

    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }

    searchDebounceRef.current = setTimeout(() => {
      searchDebounceRef.current = null;
      runPredictiveSearch(searchQuery, requestId);
    }, 350);

    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
        searchDebounceRef.current = null;
      }
    };
  }, [searchQuery, showSearch, runPredictiveSearch, abortPendingSearch]);

  const activeGenreFilter = useMemo(
    () => getActiveGenreFilterForSection(librarySection, seriesGenreFilter),
    [librarySection, seriesGenreFilter]
  );

  const currentRootRequestKey = useMemo(
    () => getCurrentRootRequestKey(),
    [getCurrentRootRequestKey]
  );

  const nearEndTriggerKey = useMemo(() => {
    if (!hasMore || isLoadingMore || showSearch || navContext) return null;
    if (librarySection === 'favorites' || librarySection === 'history') return null;
    return `${buildLoadMorePageKey(currentRootRequestKey, contentPage + 1)}::retry:${nearEndGeneration}`;
  }, [hasMore, isLoadingMore, showSearch, navContext, librarySection, currentRootRequestKey, contentPage, nearEndGeneration]);

  const displayMovies = useMemo(() => {
    if (showSearch) return decorateCorridorItems(searchResults, 'search');
    if (navContext?.type === 'seasons') return decorateCorridorItems(navContext.seasons, `seasons:${navContext.seriesId}`);
    if (navContext?.type === 'episodes') return decorateCorridorItems(navContext.episodes, `episodes:${navContext.seriesId}:${navContext.seasonNum}`);
    if (librarySection === 'favorites') return decorateCorridorItems(favorites, 'favorites');
    if (librarySection === 'history') return decorateCorridorItems(watchHistory, 'history');

    let base = librarySection === 'series' ? seriesItems : librarySection === 'israeli' ? israeliItems : baseMovies;
    return decorateCorridorItems(
      applyCatalogFilters(base, { sortMode, yearFilter, genreFilter: activeGenreFilter, randomSeed: shuffleSeed }),
      currentRootRequestKey
    );
  }, [showSearch, searchResults, navContext, librarySection, favorites, watchHistory, seriesItems, israeliItems, baseMovies, sortMode, yearFilter, activeGenreFilter, shuffleSeed, currentRootRequestKey]);

  const displayMoviesRef = useRef(displayMovies);
  useEffect(() => { displayMoviesRef.current = displayMovies; }, [displayMovies]);

  const posterLayout = useMemo(() => buildPosterLayout(displayMovies), [displayMovies]);

  const renderedPosterLayout = useMemo(() => {
    return getRenderedPosterLayout(posterLayout, cameraZ, getCorridorRenderAheadCount(posterBatchSize));
  }, [cameraZ, posterLayout, posterBatchSize]);

  const lastPosterZ = useMemo(() => getLastPosterZ(posterLayout), [posterLayout]);

  useEffect(() => {
    prefetchPostersForItems(displayMovies.slice(0, posterBatchSize));
  }, [displayMovies, posterBatchSize, prefetchPostersForItems]);

  useEffect(() => {
    prefetchPostersForItems(renderedPosterLayout.map((entry: any) => entry.movie), 6);
  }, [renderedPosterLayout, prefetchPostersForItems]);

  // --- Remote Control logic ---
  const performBackAction = useCallback(() => {
    switch (resolveAppBackAction(shellSnapshot)) {
      case 'closePlayer':
        void closePlayer();
        return;
      case 'closePosterContext':
        setPosterContextMovie(null);
        return;
      case 'closeSettings':
        closeSettingsSurface();
        return;
      case 'closeCinemaScreen':
        setShowCinemaScreen(false);
        return;
      case 'closeSelectedMovie':
        setSelectedMovie(null);
        return;
      case 'closeSearch':
        closeSearchSurface();
        return;
      case 'clearNavContext':
        setNavContext(null);
        return;
      case 'closeSidebar':
        setIsLocked(true);
        return;
      case 'openSidebar':
        setIsLocked(false);
        return;
      default:
        return;
    }
  }, [closePlayer, closeSearchSurface, closeSettingsSurface, shellSnapshot]);

  useEffect(() => {
    const sub = CapApp.addListener('backButton', performBackAction);
    return () => { sub.then((listener) => listener.remove()); };
  }, [performBackAction]);

  useEffect(() => {
    const handleGlobalBackKey = (event: KeyboardEvent) => {
      if (!shouldHandleGlobalTvBack(event, {
        isEditableTarget: isEditableTextTarget(event.target),
        hasLocalBackHandler: hasLocalBackHandlerTarget(event.target)
      })) {
        return;
      }

      stopTvEvent(event);
      performBackAction();
    };

    window.addEventListener('keydown', handleGlobalBackKey, true);
    return () => window.removeEventListener('keydown', handleGlobalBackKey, true);
  }, [performBackAction]);

  const telegramStatusLabel = tgStatus === 'loggedIn'
    ? 'מחובר לחשבון Telegram'
    : tgStatus === 'checking'
      ? 'בודק חיבור Telegram'
      : 'עדיין לא מחובר ל-Telegram';
  const telegramStatusTone = tgStatus === 'loggedIn'
    ? 'bg-emerald-400'
    : tgStatus === 'checking'
      ? 'bg-amber-400'
      : 'bg-white/40';

  return (
    <div className="w-full h-screen bg-black overflow-hidden relative text-white" dir="rtl">
      <Canvas camera={{ position: [0, 1.6, 2], fov: 75 }}>
        <ambientLight intensity={0.8} />
        <Suspense fallback={null}>
          <group>
            <gridHelper args={[100, 50, '#00ffcc', '#001111']} position={[0, 0, -50]} />
            {renderedPosterLayout.map((p: any) => (
              <Poster key={p.movie.uniqueId} movie={p.movie} isFocused={focusedId === p.movie.uniqueId} isFavorited={!!mediaStateMap[buildMediaKey(p.movie)]?.favorite} isHeartFocused={focusedHeartId === p.movie.uniqueId} watchStatus={mediaStateMap[buildMediaKey(p.movie)]?.watchStatus} position={p.position} rotation={p.rotation} />
            ))}
          </group>
          <TVController posterLayout={posterLayout} isLocked={isLocked} onPosterSelect={setSelectedMovie} onPosterLongPress={setPosterContextMovie} onHeartToggle={handleHeartToggle} setFocusedId={setFocusedId} setFocusedHeartId={setFocusedHeartId} isAnyModalOpen={isAnyShellOverlayOpen} lastPosterZ={lastPosterZ} nearEndTriggerKey={nearEndTriggerKey} cameraResetKey={currentRootRequestKey} onNearEnd={loadMoreContent} onCameraMove={setCameraZ} />
        </Suspense>
      </Canvas>

      {(isLoadingContent || isLoadingMore) && (
        <div className="absolute top-6 left-6 z-30 flex items-center gap-3 rounded-full bg-black/70 px-5 py-3 backdrop-blur-md border border-[#00ffcc]/20">
          <Loader2 className="animate-spin text-[#00ffcc]" size={20} />
          <span className="text-sm text-white/80">{isLoadingContent ? 'טוען תוכן...' : 'טוען עוד...'}</span>
        </div>
      )}

      {fetchError && !isLoadingContent && displayMovies.length === 0 && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-6">
          <div className="text-red-400 text-xl">{fetchError}</div>
          <button onClick={loadContentForCurrentSection} className="px-8 py-3 bg-[#00ffcc]/20 text-[#00ffcc] rounded-full border border-[#00ffcc]/30 hover:bg-[#00ffcc]/30">
            נסה שוב
          </button>
        </div>
      )}

      <AnimatePresence>
        {showSearch && isLocked && (
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="absolute top-10 right-10 z-50 w-[35rem] p-6 bg-black/80 backdrop-blur-xl border border-[#00ffcc]/30 rounded-[40px] shadow-2xl" data-tv-scope="ui">
            <div className="flex items-center gap-4">
              <div className="bg-[#00ffcc]/20 p-4 rounded-full text-[#00ffcc]"><Search size={24} /></div>
              <input autoFocus value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="חפש סרט או סדרה..." className="flex-1 bg-transparent border-none text-2xl outline-none" />
              {isSearchingTmdb && <Loader2 className="animate-spin text-[#00ffcc]" />}
              <button onClick={closeSearchSurface} className="p-2 opacity-50"><X /></button>
            </div>
            {searchError && (
              <div className="mt-6 text-center text-red-400">{searchError}</div>
            )}
            {!searchError && searchQuery.trim().length > 0 && searchQuery.trim().length < 3 && !isSearchingTmdb && (
              <div className="mt-6 text-center text-gray-500">הקלד לפחות 3 תווים לחיפוש</div>
            )}
            {!searchError && searchResults.length === 0 && searchQuery.trim().length >= 3 && !isSearchingTmdb && (
              <div className="mt-6 text-center text-gray-500">לא נמצאו תוצאות</div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedMovie && showCinemaScreen && (
          <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }}>
            <CinemaGate
              title={selectedMovie.title}
              onOpenTelegramPanel={() => openSettingsPanel('telegram')}
              onOpenGeneralSettings={() => openSettingsPanel('general')}
              onBackToDetails={() => setShowCinemaScreen(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showSettings && (
          <motion.div initial={{ opacity: 0, scale: 0.985 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.985 }}>
            <AppSettingsPanel
              panel={settingsPanel}
              tabs={SETTINGS_TABS}
              onPanelChange={setSettingsPanel}
              onClose={closeSettingsSurface}
              posterBatchSize={posterBatchSize}
              posterBatchOptions={POSTER_BATCH_SIZE_OPTIONS}
              onPosterBatchSizeChange={handlePosterBatchSizeChange}
              autoPlayNextEpisode={autoPlayNextEpisode}
              onAutoPlayNextEpisodeChange={handleAutoPlayNextEpisodeChange}
              telegramStatusLabel={telegramStatusLabel}
              telegramStatusTone={telegramStatusTone}
              apiBase={normalizedApiBase}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <SideMenu
        isOpen={!isLocked}
        groups={buildSideMenuGroups({ movieGenres: [], seriesGenres: [], favoritesCount: favorites.length })}
        activeItemId={getActiveMenuItemId({
          librarySection,
          activeGenreId: movieGenreId,
          seriesGenreFilter,
          yearFilter,
          movieCategory,
          seriesCategory,
          israeliCategory,
          showSearch
        })}
        currentLabel={
          showSearch ? 'חיפוש'
            : librarySection === 'favorites' ? 'מועדפים'
              : librarySection === 'history' ? 'היסטוריה'
                : librarySection === 'series' ? 'סדרות'
                  : librarySection === 'israeli' ? 'ישראלי'
                    : 'סרטים'
        }
        onActivate={(item) => {
          if (item.kind === 'route') {
            handleCategoryNavigation(item);
          } else if (item.kind === 'settings') {
            openSettingsPanel(item.panel, { returnToSidebar: true });
          } else if (item.kind === 'action' && item.action === 'exit') {
            CapApp.exitApp();
          }
        }}
        onClose={() => setIsLocked(true)}
      />

      {selectedMovie && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/90 p-10" data-tv-scope="ui">
          <div className="bg-[#111] border border-white/10 rounded-[50px] p-12 flex gap-12 max-w-6xl w-full">
            <img src={selectedMovie.poster} className="w-96 rounded-[30px] shadow-2xl" />
            <div className="flex flex-col flex-1">
              <h2 className="text-6xl font-bold mb-6">{selectedMovie.title}</h2>
              <p className="text-2xl text-gray-400 leading-relaxed mb-10">{selectedMovie.desc}</p>
              <div className="flex gap-6 mt-auto">
                <button onClick={() => setShowCinemaScreen(true)} className="flex-1 py-6 bg-[#2AABEE] text-white text-3xl font-bold rounded-3xl">צפייה</button>
                <button onClick={() => { setShowCinemaScreen(false); setSelectedMovie(null); }} className="px-12 py-6 bg-white/10 text-2xl rounded-3xl">סגור</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
