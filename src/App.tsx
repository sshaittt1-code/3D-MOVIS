import React, { useState, useEffect, useRef, Suspense, useMemo, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Text, SpotLight } from '@react-three/drei';
import * as THREE from 'three';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Search, LogOut, Settings, Film, X, Loader2, Eye, Clock3, Heart, HeartOff, SkipForward } from 'lucide-react';
import { App as CapApp } from '@capacitor/app';
import { textureManager } from './utils/TextureManager';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { applyCatalogFilters, getApiYearFilter, getUniqueGenres, type LibrarySection, type SortMode, type YearFilter } from './utils/catalog';
import { isRemoteVersionNewer } from './utils/version';
import { buildMediaKey, createDefaultMediaStateEntry, MEDIA_STATE_STORAGE_KEY, migrateLegacyMediaState, type MediaStateEntry, type WatchStatus, updateProgressState } from './utils/mediaState';
import { findNextEpisodeInSeason, findNextSeason, shouldPrepareNextEpisode } from './utils/nextEpisode';
import { readAutoPlayNextEpisode, writeAutoPlayNextEpisode } from './utils/playerSettings';
import { SideMenu } from './components/SideMenu';
import { PosterContextMenu } from './components/PosterContextMenu';
import { buildSideMenuGroups, getActiveMenuItemId, type FeedCategory, type SettingsPanel, type SideMenuItem } from './utils/menuConfig';
import { safeGetJson, safeGetString, safeParseJson, safeRemove, safeSetJson, safeSetString } from './utils/safeStorage';
import { buildPlaybackSourceKey } from './utils/sourceKey';
import { getPrebufferTargetBytes, isPlayableFromCache, PLAYBACK_CACHE_STORAGE_KEY, readPlaybackCacheMap, removePlaybackCacheEntry, shouldDeleteCompletedCache, type PlaybackCacheEntry, type PlaybackCacheMap, upsertPlaybackCacheEntry, writePlaybackCacheMap } from './utils/playbackCache';
import { buildCategoryCacheKey, getCategoryCacheEntry, writeCategoryCacheEntry } from './utils/categoryCache';
import { DEFAULT_POSTER_BATCH_SIZE, POSTER_BATCH_SIZE_OPTIONS, readPosterBatchSize, writePosterBatchSize } from './utils/posterBatchSettings';
import { LONG_PRESS_DURATION_MS, classifyPressDuration } from './utils/longPress';
import { applyEditingKeyToInput, isEditableTextTarget } from './utils/keyboardActions';
import { normalizeSearchText, rankSearchResults, shouldTriggerPredictiveSearch } from './utils/searchNormalize';
import { NativePlayer } from './utils/nativePlayer';

const ApkInstaller = registerPlugin<any>('ApkInstaller');

// --- API Helpers ---
const API_BASE = import.meta.env.VITE_API_BASE || import.meta.env.VITE_API_BASE_URL || 'https://threed-movis.onrender.com';
const isTvSelectKey = (e: KeyboardEvent) =>
  e.key === 'Enter' || e.key === 'Select' || e.keyCode === 23;

const isTvNavigationKey = (e: KeyboardEvent) =>
  ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) || isTvSelectKey(e) || e.key === 'Escape' || e.key === 'Backspace';

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

const isTelegramAuthScreen = (status: string) =>
  status === 'phoneInput' || status === 'codeInput' || status === 'passwordInput';

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
const TVController = ({ posterLayout, isLocked, onPosterSelect, onPosterLongPress, onHeartToggle, setFocusedId, setFocusedHeartId, isAnyModalOpen, selectedMovie, lastPosterZ, onNearEnd, onCameraMove }: any) => {
  const { camera } = useThree();
  const [targetPos, setTargetPos] = useState(new THREE.Vector3(0, 1.6, 2));
  const focusedMovieRef = useRef<any>(null);
  const focusedHeartRef = useRef<string | null>(null);
  const nearEndFired = useRef(false);
  const STEP_SIZE = 0.8;
  const ROTATION_SPEED = 0.012;
  const INITIAL_CAMERA_Z = 2;
  
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
        setTargetPos(p => new THREE.Vector3(p.x, p.y, Math.min(p.z + STEP_SIZE, 5)));
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
    setTargetPos(new THREE.Vector3(0, 1.6, 2));
    targetRotY.current = 0;
    nearEndFired.current = false;
  }, [lastPosterZ]);

  useFrame((state) => {
    if (isLocked && !isAnyModalOpen && !selectedMovie) {
      if (keys.current.left) targetRotY.current += ROTATION_SPEED;
      if (keys.current.right) targetRotY.current -= ROTATION_SPEED;
      targetRotY.current = Math.max(-Math.PI / 1.8, Math.min(Math.PI / 1.8, targetRotY.current));
      camera.position.lerp(targetPos, 0.1);
      const targetQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, targetRotY.current, 0));
      camera.quaternion.slerp(targetQuat, 0.15);
      onCameraMove?.(camera.position.z);

      if (lastPosterZ !== undefined && lastPosterZ < INITIAL_CAMERA_Z && !nearEndFired.current) {
        const nearEndTriggerZ = INITIAL_CAMERA_Z + (lastPosterZ - INITIAL_CAMERA_Z) * 0.9;
        if (camera.position.z <= nearEndTriggerZ) {
          nearEndFired.current = true;
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
    setTexture((current) => (movie.poster && textureManager.hasTexture(movie.poster) ? current : null));
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

type NavCtx = null | { type: 'seasons'; seriesId: number; seriesTitle: string; seasons: any[] } | { type: 'episodes'; seriesId: number; seasonNum: number; seriesTitle: string; seasonTitle: string; episodes: any[] };

export default function App() {
  const [baseMovies, setBaseMovies] = useState<any[]>([]);
  const [seriesItems, setSeriesItems] = useState<any[]>([]);
  const [israeliItems, setIsraeliItems] = useState<any[]>([]);
  const [selectedMovie, setSelectedMovie] = useState<any>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [focusedHeartId, setFocusedHeartId] = useState<string | null>(null);
  const [showCinemaScreen, setShowCinemaScreen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [tgSearchResults, setTgSearchResults] = useState<any[]>([]);
  const [isSearchingTg, setIsSearchingTg] = useState(false);
  const [navContext, setNavContext] = useState<NavCtx>(null);
  const [librarySection, setLibrarySection] = useState<LibrarySection>('all');
  const [sortMode, setSortMode] = useState<SortMode>('feed');
  const [yearFilter, setYearFilter] = useState<YearFilter>('all');
  const [seriesGenreFilter, setSeriesGenreFilter] = useState<string | null>(null);
  const [movieCategory, setMovieCategory] = useState<FeedCategory>('popular');
  const [seriesCategory, setSeriesCategory] = useState<FeedCategory>('popular');
  const [israeliCategory, setIsraeliCategory] = useState<FeedCategory>('popular');
  const [settingsPanel, setSettingsPanel] = useState<SettingsPanel>('general');
  const [shuffleSeed, setShuffleSeed] = useState(() => Date.now());
  const [cameraZ, setCameraZ] = useState(2);
  const [transitionLabel, setTransitionLabel] = useState<string | null>(null);

  const [contentPage, setContentPage] = useState(1);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const [mediaStateMap, setMediaStateMap] = useState<Record<string, MediaStateEntry>>(() => safeGetJson(localStorage, MEDIA_STATE_STORAGE_KEY, {}));
  const [autoPlayNextEpisode, setAutoPlayNextEpisode] = useState<boolean>(() => readAutoPlayNextEpisode(localStorage, true));
  const [posterBatchSize, setPosterBatchSize] = useState<number>(() => readPosterBatchSize(localStorage, DEFAULT_POSTER_BATCH_SIZE));
  const [playbackCacheMap, setPlaybackCacheMap] = useState<PlaybackCacheMap>(() => readPlaybackCacheMap(localStorage));
  const [isBuffering, setIsBuffering] = useState(false);
  const [bufferProgress, setBufferProgress] = useState(0);
  const [bufferingSourceKey, setBufferingSourceKey] = useState<string | null>(null);

  const [apiBase, setApiBase] = useState(() => safeGetString(localStorage, 'api_base', API_BASE));
  const normalizedApiBase = useMemo(() => apiBase.replace(/\/$/, ''), [apiBase]);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [tgStatus, setTgStatus] = useState<'checking' | 'loggedOut' | 'phoneInput' | 'codeInput' | 'passwordInput' | 'loggedIn'>('checking');
  const [phone, setPhone] = useState('+972');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [activeMedia, setActiveMedia] = useState<ActivePlayback | null>(null);
  const [preparedNextMedia, setPreparedNextMedia] = useState<PreparedPlayback | null>(null);
  const [nextEpisodeOverlay, setNextEpisodeOverlay] = useState<any>(null);

  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearchingTmdb, setIsSearchingTmdb] = useState(false);
  const [posterContextMovie, setPosterContextMovie] = useState<any>(null);

  const predictiveSearchRequestRef = useRef(0);
  const predictiveSearchAbortRef = useRef<AbortController | null>(null);
  const mediaStateMapRef = useRef(mediaStateMap);
  const downloadAbortRef = useRef<AbortController | null>(null);
  const prebufferResolverRef = useRef<(() => void) | null>(null);

  useEffect(() => { mediaStateMapRef.current = mediaStateMap; safeSetJson(localStorage, MEDIA_STATE_STORAGE_KEY, mediaStateMap); }, [mediaStateMap]);

  const favorites = useMemo(() => Object.values(mediaStateMap).filter(e => e.favorite).map(e => e.snapshot), [mediaStateMap]);
  const watchHistory = useMemo(() => Object.values(mediaStateMap).filter(e => e.lastWatchedAt).sort((a,b) => (b.lastWatchedAt||0) - (a.lastWatchedAt||0)).map(e => e.snapshot), [mediaStateMap]);

  const toggleFavoriteForItem = useCallback((item: any, force?: boolean) => {
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
    stopBackgroundDownload();
    await NativePlayer.close().catch(() => null);
    setActiveMedia(null);
    setPreparedNextMedia(null);
    setNextEpisodeOverlay(null);
    setIsBuffering(false);
  };

  const stopBackgroundDownload = () => {
    downloadAbortRef.current?.abort();
    downloadAbortRef.current = null;
    prebufferResolverRef.current = null;
  };

  // --- SEARCH ENGINE ---

  const resetSearchState = (shouldHide = false) => {
    predictiveSearchRequestRef.current += 1;
    predictiveSearchAbortRef.current?.abort();
    predictiveSearchAbortRef.current = null;
    if (shouldHide) setShowSearch(false);
    setSearchQuery('');
    setSearchResults([]);
    setIsSearchingTmdb(false);
  };

  const runPredictiveSearch = useCallback(async (query: string) => {
    const normalized = normalizeSearchText(query);
    const requestId = ++predictiveSearchRequestRef.current;

    // 1. Instant Local Search
    const localMatches = rankSearchResults([...favorites, ...watchHistory, ...baseMovies, ...seriesItems, ...israeliItems], query);
    setSearchResults(localMatches.slice(0, 15));

    if (!shouldTriggerPredictiveSearch(normalized)) {
      setIsSearchingTmdb(false);
      return;
    }

    // 2. Fetch Remote Search
    predictiveSearchAbortRef.current?.abort();
    const controller = new AbortController();
    predictiveSearchAbortRef.current = controller;
    setIsSearchingTmdb(true);

    try {
      const data = await fetchApiJson(buildApiUrl(normalizedApiBase, `/api/search?q=${encodeURIComponent(query)}`), { signal: controller.signal });
      if (requestId !== predictiveSearchRequestRef.current) return;

      const remoteResults = Array.isArray(data.results) ? data.results : [];
      // Boost results that exist in local history or favorites
      const combined = rankSearchResults([...localMatches, ...remoteResults], query);
      setSearchResults(combined.slice(0, 30));
    } catch (e: any) {
      if (e.name !== 'AbortError' && requestId === predictiveSearchRequestRef.current) {
        console.error('Search failed', e);
      }
    } finally {
      if (requestId === predictiveSearchRequestRef.current) {
        setIsSearchingTmdb(false);
        predictiveSearchAbortRef.current = null;
      }
    }
  }, [favorites, watchHistory, baseMovies, seriesItems, israeliItems, normalizedApiBase]);

  useEffect(() => {
    if (!showSearch || !searchQuery.trim()) {
      if (showSearch && !searchQuery.trim()) setSearchResults([]);
      return;
    }
    const timer = setTimeout(() => runPredictiveSearch(searchQuery), 350);
    return () => clearTimeout(timer);
  }, [searchQuery, showSearch, runPredictiveSearch]);

  const displayMovies = useMemo(() => {
    if (showSearch) return searchResults.map((m, i) => ({ ...m, uniqueId: `s-${m.id}-${i}` }));
    if (navContext?.type === 'seasons') return navContext.seasons;
    if (navContext?.type === 'episodes') return navContext.episodes;
    if (librarySection === 'favorites') return favorites.map((m, i) => ({ ...m, uniqueId: `f-${m.id}-${i}` }));
    if (librarySection === 'history') return watchHistory.map((m, i) => ({ ...m, uniqueId: `h-${m.id}-${i}` }));

    let base = librarySection === 'series' ? seriesItems : librarySection === 'israeli' ? israeliItems : baseMovies;
    return applyCatalogFilters(base, { sortMode, yearFilter, genreFilter: seriesGenreFilter, randomSeed: shuffleSeed })
      .map((m, i) => ({ ...m, uniqueId: `${librarySection}-${m.id}-${i}` }));
  }, [showSearch, searchResults, navContext, librarySection, favorites, watchHistory, seriesItems, israeliItems, baseMovies, sortMode, yearFilter, seriesGenreFilter, shuffleSeed]);

  const displayMoviesRef = useRef(displayMovies);
  useEffect(() => { displayMoviesRef.current = displayMovies; }, [displayMovies]);

  const posterLayout = useMemo(() => displayMovies.map((movie, index) => {
    const zIndex = Math.floor(index / 2);
    const isLeft = index % 2 === 0;
    return { movie, position: [isLeft ? -4.9 : 4.9, 3.2, -zIndex * 5 - 2], rotation: [0, isLeft ? Math.PI / 2.2 : -Math.PI / 2.2, 0] };
  }), [displayMovies]);

  const renderedPosterLayout = useMemo(() => {
    const currentIdx = Math.max(0, Math.floor((2 - cameraZ) / 5) * 2);
    return posterLayout.slice(Math.max(0, currentIdx - 6), currentIdx + 20);
  }, [cameraZ, posterLayout]);

  const lastPosterZ = posterLayout.length > 0 ? posterLayout[posterLayout.length-1].position[2] : -2;

  // --- Remote Control logic ---
  useEffect(() => {
    const handleBack = () => {
      if (activeMedia) { closePlayer(); return; }
      if (posterContextMovie) { setPosterContextMovie(null); return; }
      if (selectedMovie) { setSelectedMovie(null); return; }
      if (showCinemaScreen) { setShowCinemaScreen(false); return; }
      if (showSearch) { resetSearchState(true); return; }
      if (navContext) { setNavContext(null); return; }
      if (showSettings) { setShowSettings(false); return; }
      setIsLocked(false);
    };
    const sub = CapApp.addListener('backButton', handleBack);
    return () => { sub.then(s => s.remove()); };
  }, [activeMedia, posterContextMovie, selectedMovie, showCinemaScreen, showSearch, navContext, showSettings]);

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
          <TVController posterLayout={posterLayout} isLocked={isLocked} onPosterSelect={setSelectedMovie} onPosterLongPress={setPosterContextMovie} onHeartToggle={handleHeartToggle} setFocusedId={setFocusedId} setFocusedHeartId={setFocusedHeartId} isAnyModalOpen={!!selectedMovie || showSearch || showSettings || showCinemaScreen} lastPosterZ={lastPosterZ} onCameraMove={setCameraZ} />
        </Suspense>
      </Canvas>

      <AnimatePresence>
        {showSearch && isLocked && (
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="absolute top-10 right-10 z-50 w-[35rem] p-6 bg-black/80 backdrop-blur-xl border border-[#00ffcc]/30 rounded-[40px] shadow-2xl" data-tv-scope="ui">
            <div className="flex items-center gap-4">
              <div className="bg-[#00ffcc]/20 p-4 rounded-full text-[#00ffcc]"><Search size={24} /></div>
              <input autoFocus value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="חפש סרט או סדרה..." className="flex-1 bg-transparent border-none text-2xl outline-none" />
              {isSearchingTmdb && <Loader2 className="animate-spin text-[#00ffcc]" />}
              <button onClick={() => resetSearchState(true)} className="p-2 opacity-50"><X /></button>
            </div>
            {searchResults.length === 0 && searchQuery.length > 1 && !isSearchingTmdb && (
              <div className="mt-6 text-center text-gray-500">לא נמצאו תוצאות</div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <SideMenu isOpen={!isLocked} groups={buildSideMenuGroups({ movieGenres: [], seriesGenres: [], favoritesCount: favorites.length })} activeItemId="" currentLabel="" onActivate={(item) => {
        if (item.kind === 'route' && item.route.target === 'search') { setShowSearch(true); setIsLocked(true); }
        else if (item.kind === 'settings') { setSettingsPanel(item.panel); setShowSettings(true); }
      }} onClose={() => setIsLocked(true)} />

      {selectedMovie && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/90 p-10" data-tv-scope="ui">
          <div className="bg-[#111] border border-white/10 rounded-[50px] p-12 flex gap-12 max-w-6xl w-full">
            <img src={selectedMovie.poster} className="w-96 rounded-[30px] shadow-2xl" />
            <div className="flex flex-col flex-1">
              <h2 className="text-6xl font-bold mb-6">{selectedMovie.title}</h2>
              <p className="text-2xl text-gray-400 leading-relaxed mb-10">{selectedMovie.desc}</p>
              <div className="flex gap-6 mt-auto">
                <button onClick={() => setShowCinemaScreen(true)} className="flex-1 py-6 bg-[#2AABEE] text-white text-3xl font-bold rounded-3xl">צפייה</button>
                <button onClick={() => setSelectedMovie(null)} className="px-12 py-6 bg-white/10 text-2xl rounded-3xl">סגור</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
