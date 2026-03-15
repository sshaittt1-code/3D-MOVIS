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

const getFeedSortMode = (_category?: FeedCategory): SortMode => 'feed';

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

// Native Android player bridge

// --- Mock Data ---
const BASE_MOVIES: any[] = [
  { id: 1, title: 'התחלה (Inception)', genre: 'מדע בדיוני', rating: 8.8, poster: 'https://image.tmdb.org/t/p/w500/8Z8dpt8NqCvxu4XTEcXCFCISCE0.jpg', desc: 'גנב שגונב סודות תאגידיים באמצעות טכנולוגיית שיתוף חלומות.' },
  { id: 2, title: 'בין כוכבים (Interstellar)', genre: 'מדע בדיוני', rating: 8.6, poster: 'https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MvrIdlsR.jpg', desc: 'צוות חוקרים נוסע דרך חור תולעת בחלל.' },
];

const SPECIAL_LIBRARY_SECTIONS: Array<{ id: LibrarySection; label: string; icon: string }> = [
  { id: 'series', label: 'סדרות', icon: '📺' },
  { id: 'favorites', label: 'מועדפים', icon: '♥' },
  { id: 'history', label: 'צפיות אחרונות', icon: '🕓' }
];

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

const formatTime = (seconds: number) => {
  const safeSeconds = Math.max(0, Math.floor(seconds || 0));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
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
        if (selectKeyDownAtRef.current === null) {
          return;
        }
        const duration = selectKeyDownAtRef.current ? Date.now() - selectKeyDownAtRef.current : 0;
        const pressKind = classifyPressDuration(duration);
        const didLongPress = longPressTriggeredRef.current || pressKind === 'long';
        if (!didLongPress) {
          if (focusedHeartRef.current) {
            onHeartToggle(focusedHeartRef.current);
          } else if (focusedMovieRef.current) {
            onPosterSelect(focusedMovieRef.current);
          }
        }
        clearLongPress();
      }
      if (isLocked && !isAnyModalOpen && !selectedMovie && isTvNavigationKey(e)) stopTvEvent(e);
    };
    window.addEventListener('keydown', handleInput, true);
    window.addEventListener('keyup', handleInputUp, true);
    return () => {
      clearLongPress();
      window.removeEventListener('keydown', handleInput, true);
      window.removeEventListener('keyup', handleInputUp, true);
    };
  }, [clearLongPress, isLocked, onPosterLongPress, onPosterSelect, onHeartToggle, isAnyModalOpen, selectedMovie]);

  // Reset position when corridor changes (new navContext)
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

      // Infinite scroll - trigger only after the user has crossed 90% of the current corridor
      if (lastPosterZ !== undefined && lastPosterZ < INITIAL_CAMERA_Z && !nearEndFired.current) {
        const nearEndTriggerZ = INITIAL_CAMERA_Z + (lastPosterZ - INITIAL_CAMERA_Z) * 0.9;
        if (camera.position.z <= nearEndTriggerZ) {
          nearEndFired.current = true;
          onNearEnd?.();
        }
      }
      // Allow re-firing after load (if lastPosterZ updates, effect above resets)

      raycaster.current.setFromCamera(centerPointer.current, camera);
      const intersects = raycaster.current.intersectObjects(state.scene.children, true);

      // Detect hearts first (higher priority = smaller target = needs closer aim)
      const heartHit = intersects.find(i => i.object.name === 'heart_mesh' && i.object.userData.uniqueId);
      const posterHit = intersects.find(i => i.object.name === 'poster_mesh' && i.object.userData.uniqueId);

      if (heartHit) {
        const id = heartHit.object.userData.uniqueId;
        const matched = posterLayout.find((p: any) => p.movie.uniqueId === id);
        if (matched) {
          focusedHeartRef.current = id;
          focusedMovieRef.current = null;
          setFocusedHeartId(id);
          setFocusedId(null);
        }
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
      textureManager.loadTexture(movie.poster)
        .then(tex => setTexture(tex))
        .catch(err => console.error('Failed to load poster texture', err));
    }
  });

  const heartColor = isFavorited ? '#ff3355' : isHeartFocused ? '#ff8899' : '#555555';
  const watchBadgeColor = watchStatus === 'watched' ? '#22c55e' : watchStatus === 'in_progress' ? '#f59e0b' : null;
  const watchBadgeGlyph = watchStatus === 'watched' ? '◉' : watchStatus === 'in_progress' ? '◷' : null;

  return (
    <group position={position} rotation={rotation} ref={groupRef}>
      {/* Poster image mesh */}
      <mesh name="poster_mesh" userData={{ uniqueId: movie.uniqueId }} position={[0, 0, 0.01]}>
        <planeGeometry args={[2.5, 3.75]} />
        <meshStandardMaterial map={texture} color={texture ? (isFocused ? '#ffffff' : '#acacac') : '#1c2730'} />
      </mesh>
      {/* Poster border mesh */}
      <mesh name="poster_mesh" userData={{ uniqueId: movie.uniqueId }} position={[0, 0, -0.02]}>
        <planeGeometry args={[2.6, 3.85]} />
        <meshBasicMaterial color={isFocused ? '#00ffcc' : '#111111'} />
      </mesh>

      {/* Heart — always-on raycasting target */}
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

      {/* Title + Rating */}
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

      {isFocused && (
        <SpotLight position={[0, 2, 3]} intensity={5} color="#00ffcc" angle={0.6} penumbra={0.5} />
      )}
      {isHeartFocused && (
        <SpotLight position={[1.05, 3, 2]} intensity={3} color="#ff3355" angle={0.5} penumbra={0.8} />
      )}
    </group>
  );
};

// --- Navigation context types ---
type NavCtx =
  | null
  | { type: 'seasons'; seriesId: number; seriesTitle: string; seasons: any[] }
  | { type: 'episodes'; seriesId: number; seasonNum: number; seriesTitle: string; seasonTitle: string; episodes: any[] };

// --- Main App ---
export default function App() {
  const [baseMovies, setBaseMovies] = useState<any[]>(BASE_MOVIES);
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

  // Infinite scroll
  const [contentPage, setContentPage] = useState(1);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const [mediaStateMap, setMediaStateMap] = useState<Record<string, MediaStateEntry>>(() => {
    const savedState = safeGetJson<Record<string, MediaStateEntry>>(localStorage, MEDIA_STATE_STORAGE_KEY, {});
    if (savedState && Object.keys(savedState).length > 0) return savedState;

    const legacyFavorites = safeGetJson<any[]>(localStorage, 'favorites', []);
    const legacyHistory = safeGetJson<any[]>(localStorage, 'watch_history', []);
    return migrateLegacyMediaState(legacyFavorites, legacyHistory);
  });
  const [autoPlayNextEpisode, setAutoPlayNextEpisode] = useState<boolean>(() => {
    return readAutoPlayNextEpisode(localStorage, true);
  });
  const [posterBatchSize, setPosterBatchSize] = useState<number>(() => {
    return readPosterBatchSize(localStorage, DEFAULT_POSTER_BATCH_SIZE);
  });
  const [playbackCacheMap, setPlaybackCacheMap] = useState<PlaybackCacheMap>(() =>
    readPlaybackCacheMap(localStorage)
  );
  const mediaStateMapRef = useRef<Record<string, MediaStateEntry>>(mediaStateMap);

  useEffect(() => {
    safeSetJson(localStorage, MEDIA_STATE_STORAGE_KEY, mediaStateMap);
    mediaStateMapRef.current = mediaStateMap;
  }, [mediaStateMap]);

  useEffect(() => {
    writeAutoPlayNextEpisode(localStorage, autoPlayNextEpisode);
  }, [autoPlayNextEpisode]);

  useEffect(() => {
    writePosterBatchSize(localStorage, posterBatchSize);
  }, [posterBatchSize]);

  useEffect(() => {
    writePlaybackCacheMap(localStorage, playbackCacheMap);
    playbackCacheMapRef.current = playbackCacheMap;
  }, [playbackCacheMap]);

  useEffect(() => {
    let cancelled = false;
    const validatePlaybackCache = async () => {
      const entries = Object.values(playbackCacheMapRef.current);
      for (const entry of entries) {
        try {
          await Filesystem.stat({ path: entry.cachePath, directory: Directory.Cache });
        } catch {
          if (!cancelled) {
            setPlaybackCacheMap((current) => removePlaybackCacheEntry(current, entry.sourceKey));
          }
        }
      }
    };
    void validatePlaybackCache();
    return () => {
      cancelled = true;
    };
  }, []);

  const favorites = useMemo(() => Object.values(mediaStateMap)
    .filter((entry) => entry.favorite)
    .sort((left, right) => (right.lastWatchedAt || 0) - (left.lastWatchedAt || 0))
    .map((entry) => entry.snapshot), [mediaStateMap]);

  const watchHistory = useMemo(() => Object.values(mediaStateMap)
    .filter((entry) => entry.lastWatchedAt)
    .sort((left, right) => (right.lastWatchedAt || 0) - (left.lastWatchedAt || 0))
    .map((entry) => entry.snapshot), [mediaStateMap]);

  const getMediaEntry = (item: any) => mediaStateMap[buildMediaKey(item)] ?? createDefaultMediaStateEntry(item);
  const getMediaEntryFromRef = (item: any) => mediaStateMapRef.current[buildMediaKey(item)] ?? createDefaultMediaStateEntry(item);

  const upsertMediaState = (item: any, updater: (current: MediaStateEntry) => MediaStateEntry) => {
    const key = buildMediaKey(item);
    if (!key) return;
    setMediaStateMap((current) => {
      const base = current[key] ?? createDefaultMediaStateEntry(item);
      return {
        ...current,
        [key]: updater(base)
      };
    });
  };

  const toggleFavoriteForItem = useCallback((item: any, nextFavorite?: boolean) => {
    upsertMediaState(item, (entry) => ({
      ...entry,
      snapshot: { ...entry.snapshot, ...item },
      favorite: typeof nextFavorite === 'boolean' ? nextFavorite : !entry.favorite
    }));
  }, []);

  const handleHeartToggle = (uniqueId: string) => {
    const allItems = displayMoviesRef.current;
    const item = navContext?.type === 'seasons'
      ? navContext.seasons.find((s: any) => s.uniqueId === uniqueId)
      : navContext?.type === 'episodes'
        ? navContext.episodes.find((e: any) => e.uniqueId === uniqueId)
        : allItems.find(m => m.uniqueId === uniqueId);
    if (!item) return;
    toggleFavoriteForItem(item);
  };

  const searchTelegramForItem = async (item: any) => {
    const queryBase = item.mediaType === 'episode'
      ? `${item.seriesTitle || navContext?.seriesTitle || ''} S${String(item.season_number || item.seasonNum || 0).padStart(2, '0')}E${String(item.episode_number || 0).padStart(2, '0')}`
      : item.title;
    const cleanQuery = queryBase.split('(')[0].trim();
    if (!cleanQuery) return [];
    const data = await fetchApiJson(buildApiUrl(normalizedApiBase, `/api/tg/search?query=${encodeURIComponent(cleanQuery)}`));
    return data.results || [];
  };

  const upsertPlaybackCache = (sourceKey: string, patch: Partial<PlaybackCacheEntry> & Pick<PlaybackCacheEntry, 'sourceKey' | 'mediaKey' | 'title' | 'mediaType' | 'peerId' | 'messageId' | 'streamUrl' | 'downloadUrl' | 'cachePath' | 'fileSizeBytes'>) => {
    setPlaybackCacheMap((current) => upsertPlaybackCacheEntry(current, sourceKey, patch));
  };

  const deletePlaybackCacheFile = async (entry: PlaybackCacheEntry | null | undefined) => {
    if (!entry?.cachePath) return;
    try {
      await Filesystem.deleteFile({
        path: entry.cachePath,
        directory: Directory.Cache
      });
    } catch {}
  };

  const stopBackgroundDownload = () => {
    if (downloadAbortRef.current) {
      downloadAbortRef.current.abort();
      downloadAbortRef.current = null;
    }
    if (prebufferResolverRef.current) {
      prebufferResolverRef.current = null;
    }
  };

  const getPlaybackCacheEntry = (sourceKey: string) => playbackCacheMapRef.current[sourceKey] ?? null;

  const persistPlaybackSnapshot = useCallback((playback: ActivePlayback | null, currentTime: number, duration: number) => {
    if (!playback?.mediaItem) return;
    const safeCurrentTime = Math.max(0, currentTime || 0);
    const safeDuration = Math.max(0, duration || playback.durationSeconds || 0);
    if (safeDuration > 0) {
      const nextEntry = updateProgressState(playback.mediaItem, getMediaEntryFromRef(playback.mediaItem), safeCurrentTime, safeDuration);
      upsertMediaState(playback.mediaItem, () => nextEntry);
    }
    upsertPlaybackCache(playback.sourceKey, {
      sourceKey: playback.sourceKey,
      mediaKey: buildMediaKey(playback.mediaItem),
      title: playback.title,
      mediaType: playback.mediaItem.mediaType,
      peerId: playback.peerId,
      messageId: playback.messageId,
      streamUrl: playback.streamUrl,
      downloadUrl: playback.downloadUrl,
      cachePath: playback.cachePath,
      cacheUri: playback.cacheUri,
      fileName: playback.fileName,
      mimeType: playback.mimeType,
      fileSizeBytes: playback.fileSizeBytes,
      bytesDownloaded: getPlaybackCacheEntry(playback.sourceKey)?.bytesDownloaded || 0,
      durationSeconds: safeDuration,
      lastPositionSeconds: safeCurrentTime,
      isComplete: getPlaybackCacheEntry(playback.sourceKey)?.isComplete || false
    });
  }, []);

  const buildPreparedPlayback = async (telegramResult: any, mediaItem: any): Promise<PreparedPlayback> => {
    const sessionStr = safeGetString(localStorage, 'tg_session');
    const sourceInfo = await fetchApiJson<TelegramSourceInfo>(buildApiUrl(normalizedApiBase, `/api/tg/source/${telegramResult.peerId}/${telegramResult.id}`), {
      headers: { 'x-tg-session': sessionStr }
    });
    const mediaKey = buildMediaKey(mediaItem);
    const sourceKey = sourceInfo.sourceKey || buildPlaybackSourceKey({
      mediaKey,
      peerId: String(telegramResult.peerId),
      messageId: telegramResult.id,
      fileName: sourceInfo.fileName || telegramResult.title,
      fileSizeBytes: sourceInfo.fileSizeBytes || telegramResult.sizeBytes,
      mimeType: sourceInfo.mimeType
    });
    const fallbackStreamPath = `/api/tg/stream/${telegramResult.peerId}/${telegramResult.id}`;
    const streamUrl = buildApiUrl(normalizedApiBase, sourceInfo.streamUrl || fallbackStreamPath);
    const downloadUrl = buildApiUrl(normalizedApiBase, sourceInfo.downloadUrl || sourceInfo.streamUrl || fallbackStreamPath);
    const cachePath = `playback-cache/${sourceKey}.mp4`;
    const existingEntry = getPlaybackCacheEntry(sourceKey);
    let cacheUri = existingEntry?.cacheUri;

    if (!cacheUri && existingEntry?.cachePath) {
      try {
        const uriResult = await Filesystem.getUri({ path: existingEntry.cachePath, directory: Directory.Cache });
        cacheUri = Capacitor.convertFileSrc(uriResult.uri);
      } catch {}
    }

    let subtitleUrl: string | undefined;

    try {
      const subData = await fetchApiJson(buildApiUrl(normalizedApiBase, `/api/tg/search-subtitles?query=${encodeURIComponent(mediaItem.title || telegramResult.title)}`));
      subtitleUrl = subData.results?.[0]?.subtitleUrl
        ? buildApiUrl(normalizedApiBase, subData.results[0].subtitleUrl)
        : subData.results?.[0]
          ? buildApiUrl(normalizedApiBase, `/api/tg/subtitle/${subData.results[0].peerId}/${subData.results[0].id}`)
          : undefined;
    } catch {
      subtitleUrl = undefined;
    }

    return {
      title: mediaItem.title || telegramResult.title,
      subtitleUrl,
      mediaItem,
      sourceKey,
      streamUrl,
      downloadUrl,
      fileSizeBytes: sourceInfo.fileSizeBytes || telegramResult.sizeBytes || 0,
      mimeType: sourceInfo.mimeType,
      fileName: sourceInfo.fileName || telegramResult.title,
      durationSeconds: sourceInfo.durationSeconds || mediaItem.durationSeconds || 0,
      cachePath,
      cacheUri,
      resumePositionSeconds: existingEntry?.lastPositionSeconds || 0,
      peerId: telegramResult.peerId,
      messageId: telegramResult.id
    };
  };

  const resolveNextEpisode = async (episode: any) => {
    if (episode?.mediaType !== 'episode' || !episode.seriesId) return null;

    const currentSeasonNumber = episode.season_number || episode.seasonNum || 0;
    const currentEpisodes = navContext?.type === 'episodes' && navContext.seriesId === episode.seriesId && navContext.seasonNum === currentSeasonNumber
      ? navContext.episodes
      : [];
    const inSeasonNext = currentEpisodes.length > 0 ? findNextEpisodeInSeason(episode, currentEpisodes) : null;
    if (inSeasonNext) return { ...inSeasonNext, seriesTitle: episode.seriesTitle || navContext?.seriesTitle };

    const seasonsData = await fetchApiJson(buildApiUrl(normalizedApiBase, `/api/series/${episode.seriesId}`));
    const seasons = seasonsData.seasons || [];
    const nextSeason = findNextSeason(currentSeasonNumber, seasons);
    if (!nextSeason) return null;

    const nextSeasonData = await fetchApiJson(buildApiUrl(normalizedApiBase, `/api/series/${episode.seriesId}/season/${nextSeason.season_number}`));
    const nextEpisodes = nextSeasonData.episodes || [];
    if (nextEpisodes.length === 0) return null;

    return {
      ...nextEpisodes[0],
      seriesTitle: episode.seriesTitle || navContext?.seriesTitle || seasonsData.seriesTitle
    };
  };

  const prepareUpcomingEpisode = async (episode: any) => {
    const activeKey = buildMediaKey(episode);
    if (!activeKey || preloadAttemptKeyRef.current === activeKey || dismissedAutoPlayRef.current === activeKey) return;
    preloadAttemptKeyRef.current = activeKey;

    try {
      const nextEpisode = await resolveNextEpisode(episode);
      if (!nextEpisode) return;
      const telegramResults = await searchTelegramForItem(nextEpisode);
      if (!telegramResults.length) return;
      const prepared = await buildPreparedPlayback(telegramResults[0], nextEpisode);
      setPreparedNextMedia(prepared);
    } catch {
      setPreparedNextMedia(null);
    }
  };

  const startBackgroundDownload = async (prepared: PreparedPlayback) => {
    stopBackgroundDownload();
    const existingEntry = getPlaybackCacheEntry(prepared.sourceKey);
    const existingBytes = existingEntry?.bytesDownloaded || 0;
    const targetBytes = getPrebufferTargetBytes(prepared.fileSizeBytes);
    const controller = new AbortController();
    downloadAbortRef.current = controller;

    upsertPlaybackCache(prepared.sourceKey, {
      sourceKey: prepared.sourceKey,
      mediaKey: buildMediaKey(prepared.mediaItem),
      title: prepared.title,
      mediaType: prepared.mediaItem.mediaType,
      peerId: prepared.peerId,
      messageId: prepared.messageId,
      streamUrl: prepared.streamUrl,
      downloadUrl: prepared.downloadUrl,
      cachePath: prepared.cachePath,
      cacheUri: prepared.cacheUri,
      fileName: prepared.fileName,
      mimeType: prepared.mimeType,
      fileSizeBytes: prepared.fileSizeBytes,
      bytesDownloaded: existingBytes,
      durationSeconds: prepared.durationSeconds,
      lastPositionSeconds: existingEntry?.lastPositionSeconds || prepared.resumePositionSeconds || 0,
      isComplete: existingEntry?.isComplete || false
    });

    if (existingBytes >= targetBytes && prebufferResolverRef.current) {
      prebufferResolverRef.current();
      prebufferResolverRef.current = null;
    }

    if (prepared.fileSizeBytes > 0 && existingBytes >= prepared.fileSizeBytes) {
      return;
    }

    const response = await fetch(prepared.downloadUrl, {
      headers: existingBytes > 0 ? { Range: `bytes=${existingBytes}-` } : undefined,
      signal: controller.signal
    });
    if (!response.ok && response.status !== 206) {
      throw new Error(`Download failed with ${response.status}`);
    }
    if (!response.body) {
      throw new Error('Streaming reader is not available in this environment');
    }

    let downloaded = existingBytes;
    let started = existingBytes > 0;
    if (existingBytes > 0 && response.status !== 206) {
      try {
        await Filesystem.deleteFile({ path: prepared.cachePath, directory: Directory.Cache });
      } catch {}
      downloaded = 0;
      started = false;
    }

    const reader = response.body.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || controller.signal.aborted) break;

      const base64Chunk = toBase64(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
      if (!started) {
        await Filesystem.writeFile({
          path: prepared.cachePath,
          directory: Directory.Cache,
          data: base64Chunk,
          recursive: true
        });
        started = true;
      } else {
        await Filesystem.appendFile({
          path: prepared.cachePath,
          directory: Directory.Cache,
          data: base64Chunk
        });
      }

      downloaded += value.byteLength;
      const isComplete = prepared.fileSizeBytes > 0 ? downloaded >= prepared.fileSizeBytes : false;
      let cacheUri = prepared.cacheUri;
      if (isComplete && !cacheUri) {
        try {
          const uriResult = await Filesystem.getUri({ path: prepared.cachePath, directory: Directory.Cache });
          cacheUri = Capacitor.convertFileSrc(uriResult.uri);
        } catch {}
      }

      upsertPlaybackCache(prepared.sourceKey, {
        sourceKey: prepared.sourceKey,
        mediaKey: buildMediaKey(prepared.mediaItem),
        title: prepared.title,
        mediaType: prepared.mediaItem.mediaType,
        peerId: prepared.peerId,
        messageId: prepared.messageId,
        streamUrl: prepared.streamUrl,
        downloadUrl: prepared.downloadUrl,
        cachePath: prepared.cachePath,
        cacheUri,
        fileName: prepared.fileName,
        mimeType: prepared.mimeType,
        fileSizeBytes: prepared.fileSizeBytes,
        bytesDownloaded: downloaded,
        durationSeconds: prepared.durationSeconds,
        lastPositionSeconds: getPlaybackCacheEntry(prepared.sourceKey)?.lastPositionSeconds || prepared.resumePositionSeconds || 0,
        isComplete
      });

      setBufferProgress(prepared.fileSizeBytes > 0 ? Math.min(100, Math.round((downloaded / targetBytes) * 100)) : 0);
      if (downloaded >= targetBytes && prebufferResolverRef.current) {
        prebufferResolverRef.current();
        prebufferResolverRef.current = null;
      }
    }

    if (prebufferResolverRef.current) {
      prebufferResolverRef.current();
      prebufferResolverRef.current = null;
    }
  };

  const activatePreparedPlayback = async (prepared: PreparedPlayback) => {
    setIsBuffering(true);
    setBufferProgress(0);
    setBufferingSourceKey(prepared.sourceKey);

    const entry = getPlaybackCacheEntry(prepared.sourceKey);
    const alreadyBuffered = (entry?.bytesDownloaded || 0) >= getPrebufferTargetBytes(prepared.fileSizeBytes);
    if (!alreadyBuffered) {
      await new Promise<void>((resolve, reject) => {
        prebufferResolverRef.current = resolve;
        startBackgroundDownload(prepared).catch(reject);
      });
    } else {
      void startBackgroundDownload(prepared).catch(() => undefined);
    }

    const latestEntry = getPlaybackCacheEntry(prepared.sourceKey);
    const url = isPlayableFromCache(latestEntry)
      ? latestEntry!.cacheUri!
      : prepared.streamUrl;

    setShowCinemaScreen(false);
    setSelectedMovie(null);
    setIsBuffering(false);
    setBufferingSourceKey(null);
    const nextActiveMedia = {
      ...prepared,
      url,
      cacheUri: latestEntry?.cacheUri || prepared.cacheUri,
      resumePositionSeconds: latestEntry?.lastPositionSeconds || prepared.resumePositionSeconds || 0
    };
    playerPositionRef.current = nextActiveMedia.resumePositionSeconds || 0;
    playerDurationRef.current = latestEntry?.durationSeconds || prepared.durationSeconds || 0;
    setActiveMedia(nextActiveMedia);
    try {
      await NativePlayer.open({
        url: nextActiveMedia.url,
        title: nextActiveMedia.title,
        sourceKey: nextActiveMedia.sourceKey,
        subtitleUrl: nextActiveMedia.subtitleUrl,
        startPositionMs: Math.round((nextActiveMedia.resumePositionSeconds || 0) * 1000)
      });
    } catch (error) {
      setActiveMedia(null);
      throw error instanceof Error ? error : new Error('Native player failed to open');
    }
  };

  const closePlayer = async (completedPlayback = false) => {
    stopBackgroundDownload();
    const playback = activeMediaRef.current;
    const currentTime = completedPlayback
      ? Math.max(playerDurationRef.current || playback?.durationSeconds || 0, playerPositionRef.current)
      : playerPositionRef.current;
    const duration = Math.max(playerDurationRef.current || playback?.durationSeconds || 0, currentTime);
    if (playback) {
      persistPlaybackSnapshot(playback, currentTime, duration);
    }
    await NativePlayer.close().catch(() => undefined);

    const cacheEntry = playback ? getPlaybackCacheEntry(playback.sourceKey) : null;
    const watched = playback
      ? (duration > 0 && updateProgressState(playback.mediaItem, getMediaEntryFromRef(playback.mediaItem), currentTime, duration).watchStatus === 'watched') || completedPlayback
      : completedPlayback;
    if (shouldDeleteCompletedCache(cacheEntry, watched)) {
      await deletePlaybackCacheFile(cacheEntry);
      setPlaybackCacheMap((current) => removePlaybackCacheEntry(current, cacheEntry!.sourceKey));
    }
    playerPositionRef.current = 0;
    playerDurationRef.current = 0;
    setActiveMedia(null);
    setPreparedNextMedia(null);
    setNextEpisodeOverlay(null);
    setIsBuffering(false);
    setBufferProgress(0);
    setBufferingSourceKey(null);
  };

  // Buffering States
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
  const [nextEpisodeOverlay, setNextEpisodeOverlay] = useState<{ title: string; remainingSeconds: number } | null>(null);

  const [loginId, setLoginId] = useState('');

  const CURRENT_VERSION = '1.0.6';
  const [otaVersion, setOtaVersion] = useState<string | null>(null);
  const [otaMessage, setOtaMessage] = useState<string | null>(null);
  const [otaDate, setOtaDate] = useState<string | null>(null);
  const [isDownloadingOta, setIsDownloadingOta] = useState(false);
  const [otaDownloadProgress, setOtaDownloadProgress] = useState(0);

  // In-app search
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearchingTmdb, setIsSearchingTmdb] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const playbackProgressRef = useRef(0);
  const playerPositionRef = useRef(0);
  const playerDurationRef = useRef(0);
  const preloadAttemptKeyRef = useRef<string | null>(null);
  const dismissedAutoPlayRef = useRef<string | null>(null);
  const displayMoviesRef = useRef<any[]>([]);
  const downloadAbortRef = useRef<AbortController | null>(null);
  const prebufferResolverRef = useRef<(() => void) | null>(null);
  const playbackCacheMapRef = useRef<PlaybackCacheMap>(playbackCacheMap);
  const activeMediaRef = useRef<ActivePlayback | null>(null);
  const preparedNextMediaRef = useRef<PreparedPlayback | null>(null);
  const categoryRequestMapRef = useRef<Map<string, Promise<{ items: any[]; hasMore: boolean }>>>(new Map());
  const categoryPrefetchRef = useRef<Set<string>>(new Set());
  const currentBrowseRequestKeyRef = useRef('');
  const predictiveSearchCacheRef = useRef<Map<string, any[]>>(new Map());
  const predictiveSearchRequestRef = useRef(0);
  const predictiveSearchAbortRef = useRef<AbortController | null>(null);
  const prepareUpcomingEpisodeRef = useRef<(episode: any) => Promise<void>>(async () => undefined);
  const dismissUpcomingAutoplayRef = useRef<() => void>(() => undefined);
  const closePlayerRef = useRef<(completedPlayback?: boolean) => Promise<void>>(async () => undefined);
  const activatePreparedPlaybackRef = useRef<(prepared: PreparedPlayback) => Promise<void>>(async () => undefined);
  const [posterContextMovie, setPosterContextMovie] = useState<any>(null);

  const saveToHistory = (movie: any) => {
    upsertMediaState(movie, (entry) => ({
      ...entry,
      snapshot: { ...entry.snapshot, ...movie },
      lastWatchedAt: Date.now()
    }));
  };

  // Dynamic genres from /api/genres
  const [genreList, setGenreList] = useState<any[]>([]);
  const [activeGenreId, setActiveGenreId] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchApiJson(buildApiUrl(normalizedApiBase, '/api/genres'))
      .then(data => {
        if (!cancelled) setGenreList(Array.isArray(data.genres) ? data.genres : []);
      })
      .catch(() => {
        if (!cancelled) setGenreList([]);
      });
    return () => {
      cancelled = true;
    };
  }, [normalizedApiBase]);

  useEffect(() => {
    let cancelled = false;
    fetchApiJson(buildApiUrl(normalizedApiBase, '/api/version'))
      .then(data => {
        if (cancelled) return;
        if (isRemoteVersionNewer(CURRENT_VERSION, data.version)) {
          setOtaVersion(data.version);
          setOtaMessage(data.message);
          setOtaDate(data.date);
        } else {
          setOtaVersion(null);
          setOtaMessage(null);
          setOtaDate(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setOtaVersion(null);
          setOtaMessage(null);
          setOtaDate(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [CURRENT_VERSION, normalizedApiBase]);

  useEffect(() => {
    const sessionStr = safeGetString(localStorage, 'tg_session');
    let cancelled = false;
    fetchApiJson(buildApiUrl(normalizedApiBase, '/api/tg/status'), { headers: { 'x-tg-session': sessionStr } })
      .then(data => {
        if (!cancelled) setTgStatus(data.loggedIn ? 'loggedIn' : 'loggedOut');
      })
      .catch(() => {
        if (!cancelled) setTgStatus('loggedOut');
      });
    return () => {
      cancelled = true;
    };
  }, [normalizedApiBase]);

  useEffect(() => {
    playbackProgressRef.current = 0;
    preloadAttemptKeyRef.current = null;
    dismissedAutoPlayRef.current = null;
    setPreparedNextMedia(null);
    setNextEpisodeOverlay(null);
  }, [activeMedia?.mediaItem?.id, activeMedia?.mediaItem?.season_number, activeMedia?.mediaItem?.episode_number]);

  useEffect(() => {
    activeMediaRef.current = activeMedia;
  }, [activeMedia]);

  useEffect(() => {
    preparedNextMediaRef.current = preparedNextMedia;
  }, [preparedNextMedia]);

  useEffect(() => {
    const persistCurrentPlayback = () => {
      if (!activeMediaRef.current) return;
      persistPlaybackSnapshot(activeMediaRef.current, playerPositionRef.current, playerDurationRef.current || activeMediaRef.current.durationSeconds || 0);
    };

    const onBeforeUnload = () => persistCurrentPlayback();
    window.addEventListener('beforeunload', onBeforeUnload);

    let appStateHandle: { remove: () => void } | undefined;
    CapApp.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) persistCurrentPlayback();
    }).then((listener) => {
      appStateHandle = listener;
    }).catch(() => undefined);

    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      appStateHandle?.remove();
    };
  }, [persistPlaybackSnapshot]);

  const loadSeriesSeasons = async (seriesId: number, seriesTitle: string) => {
    const data = await fetchApiJson(buildApiUrl(normalizedApiBase, `/api/series/${seriesId}`));
    const seasons = (Array.isArray(data.seasons) ? data.seasons : []).map((season: any, index: number) => ({
      ...season,
      uniqueId: `season-${season.id}-${index}`
    }));
    setNavContext({ type: 'seasons', seriesId, seriesTitle: data.seriesTitle || seriesTitle, seasons });
  };

  // Hardware Back Button Interceptor for Android TV (so remote 'Back' doesn't kill the app)
  useEffect(() => {
    const handleBackEvent = () => {
      if (activeMedia) { void closePlayer(); return; }
      if (posterContextMovie) { closePosterContextMenu(); return; }
      if (selectedMovie) { setSelectedMovie(null); return; }
      if (showCinemaScreen) { closeTelegramSourceScreen(); return; }
      if (showSearch) { resetSearchState(true); return; }
      if (navContext) {
        if (navContext.type === 'episodes') {
          const ctx = navContext;
          void loadSeriesSeasons(ctx.seriesId, ctx.seriesTitle);
        } else {
          setNavContext(null);
        }
        return;
      }
      if (showSettings) { setShowSettings(false); return; }
      if (isTelegramAuthScreen(tgStatus)) {
        setTgStatus('loggedOut'); 
        return; 
      }
      setIsLocked((current) => !current);
      setFocusedId(null);
    };

    let backListener: any;
    CapApp.addListener('backButton', handleBackEvent).then(l => backListener = l);
    return () => { if (backListener) backListener.remove(); };
  }, [activeMedia, closePosterContextMenu, normalizedApiBase, navContext, posterContextMovie, selectedMovie, showCinemaScreen, showSearch, showSettings, tgStatus]);

  useEffect(() => {
    const handleGlobalBack = (e: KeyboardEvent) => {
      if ((e.key === 'Backspace' || e.key === 'Delete') && isEditableTextTarget(document.activeElement)) {
        stopTvEvent(e);
        applyEditingKeyToInput(document.activeElement, e.key === 'Delete' ? 'Delete' : 'Backspace');
        return;
      }

      // Catch conventional keyboard ESC for Web compatibility
      if (e.key === 'Escape' || e.key === 'Backspace') {
        if (activeMedia) {
          stopTvEvent(e);
          void closePlayer();
          return;
        }
        if (posterContextMovie) {
          stopTvEvent(e);
          closePosterContextMenu();
          return;
        }
        if (selectedMovie) {
          stopTvEvent(e);
          setSelectedMovie(null);
          return;
        }
        if (navContext) {
          stopTvEvent(e);
          if (navContext.type === 'episodes') {
            const ctx = navContext as any;
            void loadSeriesSeasons(ctx.seriesId, ctx.seriesTitle);
          } else {
            setNavContext(null);
          }
          return;
        }
        if (isTelegramAuthScreen(tgStatus)) {
          stopTvEvent(e);
          setTgStatus('loggedOut');
          return;
        }
        if (isSearchingTg) {
          stopTvEvent(e);
          setIsSearchingTg(false);
          return;
        }
        if (showSearch) {
          stopTvEvent(e);
          resetSearchState(true);
          return;
        }
        if (showCinemaScreen) {
          stopTvEvent(e);
          closeTelegramSourceScreen();
          return;
        }
        if (showSettings) {
          stopTvEvent(e);
          setShowSettings(false);
          return;
        }
        stopTvEvent(e);
        setIsLocked((current) => !current);
        setFocusedId(null);
      }
    };
    
    const handleMenuInput = (e: KeyboardEvent) => {
      if (!isTvSelectKey(e)) return;
      if (isUiScopeTarget(e.target) || isUiScopeTarget(document.activeElement)) return;
      
      // Let standard HTML buttons/inputs handle the OK click native to Android Webview
      const activeTag = document.activeElement?.tagName.toLowerCase();
      const isInputFocused = activeTag === 'input' || activeTag === 'button' || activeTag === 'a';
      if (isInputFocused) return;
      
      if (
        posterContextMovie
        || activeMedia
        || showSettings
        || showCinemaScreen
        || showSearch
        || selectedMovie
        || isTelegramAuthScreen(tgStatus)
      ) {
        return;
      }

      // If we are showing the corridor and nothing selected yet, start playing
      if (!isLocked) {
        stopTvEvent(e);
        blurActiveElement();
        setIsLocked(true);
      }
    };

    window.addEventListener('keydown', handleMenuInput, true);
    window.addEventListener('keydown', handleGlobalBack, true);
    return () => {
      window.removeEventListener('keydown', handleMenuInput, true);
      window.removeEventListener('keydown', handleGlobalBack, true);
    };
  }, [activeMedia, apiBase, closePosterContextMenu, isLocked, isSearchingTg, navContext, posterContextMovie, selectedMovie, showCinemaScreen, showSearch, showSettings, tgStatus]);

  useEffect(() => {
    if (isLocked) {
      blurActiveElement();
    }
  }, [isLocked]);


  const isMoviesSection = librarySection === 'all';
  const isSeriesSection = librarySection === 'series';
  const isIsraeliSection = librarySection === 'israeli';
  const isFavoritesSection = librarySection === 'favorites';
  const isHistorySection = librarySection === 'history';
  const isBrowseSection = isMoviesSection || isSeriesSection || isIsraeliSection;
  const isRootCorridor = !navContext && !selectedMovie && !showCinemaScreen && !activeMedia && !showSettings && tgStatus !== 'phoneInput' && tgStatus !== 'codeInput' && tgStatus !== 'passwordInput';
  const activeBrowseCategory = isSeriesSection ? seriesCategory : isIsraeliSection ? israeliCategory : movieCategory;
  const activeRandomSeed = activeBrowseCategory === 'random' ? shuffleSeed : null;
  const activeBrowseRequestKey = useMemo(() => JSON.stringify({
    librarySection,
    movieCategory,
    seriesCategory,
    israeliCategory,
    activeGenreId,
    seriesGenreFilter,
    yearFilter,
    posterBatchSize,
    activeRandomSeed
  }), [activeGenreId, activeRandomSeed, israeliCategory, librarySection, movieCategory, posterBatchSize, seriesCategory, seriesGenreFilter, yearFilter]);

  useEffect(() => {
    currentBrowseRequestKeyRef.current = activeBrowseRequestKey;
  }, [activeBrowseRequestKey]);

  const buildMoviesFeedPath = useCallback((page: number) => {
    const params = new URLSearchParams({
      page: String(page),
      page_size: String(posterBatchSize),
      category: movieCategory
    });
    const apiYear = getApiYearFilter(yearFilter);
    if (activeGenreId) params.set('genre_id', String(activeGenreId));
    if (apiYear) params.set('year', apiYear);
    if (movieCategory === 'random') params.set('seed', String(shuffleSeed));
    return buildApiUrl(normalizedApiBase, `/api/movies?${params.toString()}`);
  }, [activeGenreId, movieCategory, normalizedApiBase, posterBatchSize, shuffleSeed, yearFilter]);

  const buildSeriesFeedPath = useCallback((page: number) => {
    const params = new URLSearchParams({
      page: String(page),
      page_size: String(posterBatchSize),
      category: seriesCategory
    });
    const apiYear = getApiYearFilter(yearFilter);
    if (apiYear) params.set('year', apiYear);
    if (seriesCategory === 'random') params.set('seed', String(shuffleSeed));
    return buildApiUrl(normalizedApiBase, `/api/series?${params.toString()}`);
  }, [normalizedApiBase, posterBatchSize, seriesCategory, shuffleSeed, yearFilter]);

  const buildIsraeliFeedPath = useCallback((page: number) => {
    const params = new URLSearchParams({
      page: String(page),
      page_size: String(posterBatchSize),
      category: israeliCategory
    });
    const apiYear = getApiYearFilter(yearFilter);
    if (apiYear) params.set('year', apiYear);
    if (israeliCategory === 'random') params.set('seed', String(shuffleSeed));
    return buildApiUrl(normalizedApiBase, `/api/israeli?${params.toString()}`);
  }, [israeliCategory, normalizedApiBase, posterBatchSize, shuffleSeed, yearFilter]);

  const buildMovieCacheKey = useCallback((page: number) => buildCategoryCacheKey({
    target: 'movies',
    category: movieCategory,
    genreId: activeGenreId,
    year: String(yearFilter),
    page,
    batchSize: posterBatchSize,
    seed: movieCategory === 'random' ? shuffleSeed : undefined
  }), [activeGenreId, movieCategory, posterBatchSize, shuffleSeed, yearFilter]);

  const buildSeriesCacheKey = useCallback((page: number) => buildCategoryCacheKey({
    target: 'series',
    category: seriesCategory,
    genreLabel: seriesGenreFilter,
    year: String(yearFilter),
    page,
    batchSize: posterBatchSize,
    seed: seriesCategory === 'random' ? shuffleSeed : undefined
  }), [posterBatchSize, seriesCategory, seriesGenreFilter, shuffleSeed, yearFilter]);

  const buildIsraeliCacheKey = useCallback((page: number) => buildCategoryCacheKey({
    target: 'israeli',
    category: israeliCategory,
    year: String(yearFilter),
    page,
    batchSize: posterBatchSize,
    seed: israeliCategory === 'random' ? shuffleSeed : undefined
  }), [israeliCategory, posterBatchSize, shuffleSeed, yearFilter]);

  const fetchCategoryPage = useCallback(async ({
    cacheKey,
    path,
    field
  }: {
    cacheKey: string;
    path: string;
    field: 'movies' | 'series' | 'items';
  }) => {
    const cached = getCategoryCacheEntry(localStorage, cacheKey);
    if (cached) return { items: cached.items, hasMore: cached.hasMore };

    const pending = categoryRequestMapRef.current.get(cacheKey);
    if (pending) return pending;

    const request = fetchApiJson(path)
      .then((data: any) => {
        const items = Array.isArray(data[field]) ? data[field] : [];
        const payload = { items, hasMore: Boolean(data.hasMore) };
        writeCategoryCacheEntry(localStorage, cacheKey, payload);
        return payload;
      })
      .finally(() => {
        categoryRequestMapRef.current.delete(cacheKey);
      });

    categoryRequestMapRef.current.set(cacheKey, request);
    return request;
  }, []);

  const prefetchCategoryPage = useCallback((options: { cacheKey: string; path: string; field: 'movies' | 'series' | 'items' }) => {
    if (categoryPrefetchRef.current.has(options.cacheKey)) return;
    if (getCategoryCacheEntry(localStorage, options.cacheKey)) return;
    categoryPrefetchRef.current.add(options.cacheKey);
    void fetchCategoryPage(options).finally(() => {
      categoryPrefetchRef.current.delete(options.cacheKey);
    });
  }, [fetchCategoryPage]);

  function openPosterContextMenu(movie: any) {
    setPosterContextMovie(movie);
  }

  function closePosterContextMenu() {
    setPosterContextMovie(null);
  }

  function resetSearchState(shouldHide = false) {
    predictiveSearchRequestRef.current += 1;
    predictiveSearchAbortRef.current?.abort();
    predictiveSearchAbortRef.current = null;
    if (shouldHide) {
      setShowSearch(false);
    }
    setSearchQuery('');
    setSearchResults([]);
    setIsSearchingTmdb(false);
  }

  // Initial movie fetch
  useEffect(() => {
    if (!isMoviesSection) return;
    const requestKey = activeBrowseRequestKey;
    const cacheKey = buildMovieCacheKey(1);
    setContentPage(1);
    setHasMore(true);
    setIsLoadingMore(false);
    setFetchError(null);
    setPosterContextMovie(null);
    let cancelled = false;
    fetchCategoryPage({ cacheKey, path: buildMoviesFeedPath(1), field: 'movies' })
      .then((data) => {
        if (cancelled || currentBrowseRequestKeyRef.current !== requestKey) return;
        setBaseMovies(data.items.length > 0 ? data.items : BASE_MOVIES);
        setHasMore(data.hasMore ?? false);
        setFetchError(null);
        if (data.hasMore) {
          prefetchCategoryPage({
            cacheKey: buildMovieCacheKey(2),
            path: buildMoviesFeedPath(2),
            field: 'movies'
          });
        }
      })
      .catch((err) => {
        if (cancelled || currentBrowseRequestKeyRef.current !== requestKey) return;
        setFetchError(`Network error: ${err.message}`);
        setBaseMovies(BASE_MOVIES);
      });
    return () => {
      cancelled = true;
    };
  }, [activeBrowseRequestKey, buildMovieCacheKey, buildMoviesFeedPath, fetchCategoryPage, isMoviesSection, prefetchCategoryPage]);

  // Load more movies when reaching the end
  const handleNearEnd = () => {
    if (isBrowseSection && displayMovies.length === 0) return;
    if (!isBrowseSection) return;
    if (isLoadingMore || !hasMore || navContext || showSearch) return;
    const nextPage = contentPage + 1;
    const requestKey = currentBrowseRequestKeyRef.current;
    const cacheKey = isSeriesSection
      ? buildSeriesCacheKey(nextPage)
      : isIsraeliSection
        ? buildIsraeliCacheKey(nextPage)
        : buildMovieCacheKey(nextPage);
    setIsLoadingMore(true);
    fetchCategoryPage({
      cacheKey,
      path: isSeriesSection ? buildSeriesFeedPath(nextPage) : isIsraeliSection ? buildIsraeliFeedPath(nextPage) : buildMoviesFeedPath(nextPage),
      field: isSeriesSection ? 'series' : isIsraeliSection ? 'items' : 'movies'
    })
      .then((data) => {
        if (currentBrowseRequestKeyRef.current !== requestKey) return;
        if (isSeriesSection) {
          setSeriesItems((prev) => [...prev, ...data.items]);
        } else if (isIsraeliSection) {
          setIsraeliItems((prev) => [...prev, ...data.items]);
        } else {
          setBaseMovies((prev) => [...prev, ...data.items]);
        }
        setContentPage(nextPage);
        setHasMore(data.hasMore ?? false);
        if (data.hasMore) {
          prefetchCategoryPage({
            cacheKey: isSeriesSection
              ? buildSeriesCacheKey(nextPage + 1)
              : isIsraeliSection
                ? buildIsraeliCacheKey(nextPage + 1)
                : buildMovieCacheKey(nextPage + 1),
            path: isSeriesSection
              ? buildSeriesFeedPath(nextPage + 1)
              : isIsraeliSection
                ? buildIsraeliFeedPath(nextPage + 1)
                : buildMoviesFeedPath(nextPage + 1),
            field: isSeriesSection ? 'series' : isIsraeliSection ? 'items' : 'movies'
          });
        }
      })
      .catch((err) => {
        if (currentBrowseRequestKeyRef.current === requestKey) {
          setFetchError(err instanceof Error ? err.message : 'Failed to load more content.');
        }
      })
      .finally(() => {
        if (currentBrowseRequestKeyRef.current === requestKey) {
          setIsLoadingMore(false);
        }
      });
  };

  // Fetch series when genre switches to 'סדרות'
  useEffect(() => {
    if (!isSeriesSection) return;
    const requestKey = activeBrowseRequestKey;
    const cacheKey = buildSeriesCacheKey(1);
    setContentPage(1);
    setHasMore(true);
    setIsLoadingMore(false);
    setFetchError(null);
    setPosterContextMovie(null);
    let cancelled = false;
    fetchCategoryPage({ cacheKey, path: buildSeriesFeedPath(1), field: 'series' })
      .then((data) => {
        if (cancelled || currentBrowseRequestKeyRef.current !== requestKey) return;
        setSeriesItems(data.items || []);
        setHasMore(data.hasMore ?? false);
        setFetchError(data.items?.length ? null : 'No series were found to load.');
        if (data.hasMore) {
          prefetchCategoryPage({
            cacheKey: buildSeriesCacheKey(2),
            path: buildSeriesFeedPath(2),
            field: 'series'
          });
        }
      })
      .catch((err) => {
        if (!cancelled && currentBrowseRequestKeyRef.current === requestKey) {
          setFetchError(`Series error: ${err.message}`);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeBrowseRequestKey, buildSeriesCacheKey, buildSeriesFeedPath, fetchCategoryPage, isSeriesSection, prefetchCategoryPage]);

  useEffect(() => {
    if (!isIsraeliSection) return;
    const requestKey = activeBrowseRequestKey;
    const cacheKey = buildIsraeliCacheKey(1);
    setContentPage(1);
    setHasMore(true);
    setIsLoadingMore(false);
    setFetchError(null);
    setPosterContextMovie(null);
    let cancelled = false;
    fetchCategoryPage({ cacheKey, path: buildIsraeliFeedPath(1), field: 'items' })
      .then((data) => {
        if (cancelled || currentBrowseRequestKeyRef.current !== requestKey) return;
        setIsraeliItems(data.items || []);
        setHasMore(data.hasMore ?? false);
        setFetchError(data.items?.length ? null : 'No Israeli content was found to load.');
        if (data.hasMore) {
          prefetchCategoryPage({
            cacheKey: buildIsraeliCacheKey(2),
            path: buildIsraeliFeedPath(2),
            field: 'items'
          });
        }
      })
      .catch((err) => {
        if (!cancelled && currentBrowseRequestKeyRef.current === requestKey) {
          setFetchError(`Israeli content error: ${err.message}`);
          setIsraeliItems([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeBrowseRequestKey, buildIsraeliCacheKey, buildIsraeliFeedPath, fetchCategoryPage, isIsraeliSection, prefetchCategoryPage]);

  // Navigate into series’ seasons
  const runCorridorTransition = async (label: string, action: () => Promise<void>) => {
    setTransitionLabel(label);
    await new Promise((resolve) => window.setTimeout(resolve, 180));
    try {
      await action();
    } finally {
      window.setTimeout(() => setTransitionLabel(null), 240);
    }
  };

  const enterSeries = async (series: any) => {
    await runCorridorTransition(`Opening ${series.title}`, async () => {
      await loadSeriesSeasons(series.id, series.title);
    });
  };

  // Navigate into a season’s episodes
  const enterSeason = async (season: any) => {
    await runCorridorTransition(`Entering ${season.title}`, async () => {
      const data = await fetchApiJson(buildApiUrl(normalizedApiBase, `/api/series/${season.seriesId}/season/${season.season_number}`));
      const episodes = (data.episodes || []).map((e: any, i: number) => ({ ...e, seriesTitle: (navContext as any)?.seriesTitle, uniqueId: `ep-${e.id}-${i}` }));
      setNavContext(prev => ({
        type: 'episodes',
        seriesId: (prev as any).seriesId,
        seriesTitle: (prev as any).seriesTitle,
        seasonNum: season.season_number,
        seasonTitle: season.title,
        episodes
      }));
    });
  };

  // Smart poster select: route based on current context
  const handlePosterSelect = (movie: any) => {
    if (navContext?.type === 'seasons') { enterSeason(movie); return; }
    if (navContext?.type === 'episodes') { setSelectedMovie(movie); return; }
    if (isSeriesSection || movie?.mediaType === 'tv') { enterSeries(movie); return; }
    setSelectedMovie(movie); // normal movie/favorite - open Telegram search
  };

  const handlePosterLongPress = (movie: any) => {
    if (!movie) return;
    openPosterContextMenu(movie);
  };

  const displayMovies = useMemo(() => {
    if (showSearch && searchResults.length > 0) {
      return searchResults.map((m: any, i: number) => ({ ...m, uniqueId: `srch-${m.id}-${m.mediaType}-${i}` }));
    }
    if (navContext?.type === 'seasons') return navContext.seasons;
    if (navContext?.type === 'episodes') return navContext.episodes;
    if (isFavoritesSection) {
      return favorites.map((m: any, i: number) => ({ ...m, uniqueId: `fav-${m.id}-${m.mediaType}-${i}` }));
    }
    if (isHistorySection) {
      return watchHistory.map((m: any, i: number) => ({ ...m, uniqueId: `hist-${m.id}-${m.mediaType}-${i}` }));
    }
    if (isSeriesSection) {
      return applyCatalogFilters(seriesItems, {
        sortMode,
        yearFilter,
        genreFilter: seriesGenreFilter,
        randomSeed: shuffleSeed
      }).map((m: any, i: number) => ({ ...m, uniqueId: `ser-${m.id}-${i}` }));
    }
    if (isIsraeliSection) {
      return applyCatalogFilters(israeliItems, {
        sortMode,
        yearFilter,
        randomSeed: shuffleSeed
      }).map((m: any, i: number) => ({ ...m, uniqueId: `isr-${m.id}-${m.mediaType}-${i}` }));
    }
    const filtered = applyCatalogFilters((baseMovies && baseMovies.length > 0 ? baseMovies : BASE_MOVIES) || [], {
      sortMode,
      yearFilter,
      randomSeed: shuffleSeed
    });
    return filtered.map((m: any, i: number) => ({ ...m, uniqueId: `${m.id}-${i}` }));
  }, [baseMovies, favorites, isFavoritesSection, isHistorySection, isIsraeliSection, isSeriesSection, israeliItems, navContext, searchResults, seriesGenreFilter, seriesItems, showSearch, shuffleSeed, sortMode, watchHistory, yearFilter]);

  useEffect(() => {
    displayMoviesRef.current = displayMovies;
  }, [displayMovies]);

  useEffect(() => {
    if (!isBrowseSection || displayMovies.length === 0) return;

    let cancelled = false;
    const currentPosterIndex = Math.max(0, Math.floor((2 - cameraZ) / 5) * 2);
    const posterUrls = displayMovies
      .slice(currentPosterIndex, currentPosterIndex + posterBatchSize)
      .map((movie: any) => movie.poster)
      .filter(Boolean);
    const nextPosterUrls = displayMovies
      .slice(currentPosterIndex + posterBatchSize, currentPosterIndex + posterBatchSize * 2)
      .map((movie: any) => movie.poster)
      .filter(Boolean);

    const preloadInitialBatch = async () => {
      await textureManager.prefetch(posterUrls, 4);
      if (cancelled) return;
      await textureManager.prefetch(nextPosterUrls, 2);
    };

    void preloadInitialBatch();

    return () => {
      cancelled = true;
    };
  }, [cameraZ, displayMovies, isBrowseSection, posterBatchSize]);

  useEffect(() => {
    if (!posterContextMovie) return;
    const exists = displayMovies.some((movie: any) => movie.uniqueId === posterContextMovie.uniqueId);
    if (!exists) {
      setPosterContextMovie(null);
    }
  }, [displayMovies, posterContextMovie]);

  const posterLayout = useMemo(() => {
    return displayMovies.map((movie: any, index: number) => {
      const zIndex = Math.floor(index / 2);
      const isLeft = index % 2 === 0;
      return {
        movie,
        position: [isLeft ? -4.9 : 4.9, 3.2, -zIndex * 5 - 2] as [number, number, number],
        rotation: [0, isLeft ? Math.PI / 2.2 : -Math.PI / 2.2, 0] as [number, number, number],
      };
    });
  }, [displayMovies]);

  const renderedPosterLayout = useMemo(() => {
    const currentPosterIndex = Math.max(0, Math.floor((2 - cameraZ) / 5) * 2);
    const renderStart = Math.max(0, currentPosterIndex - 8);
    const renderCount = Math.max(posterBatchSize + 12, 18);
    return posterLayout.slice(renderStart, renderStart + renderCount).filter(({ position }) => {
      const z = position[2] as number;
      return z < cameraZ + 28 && z > cameraZ - 90;
    });
  }, [cameraZ, posterBatchSize, posterLayout]);

  const lastPosterZ = posterLayout.length > 0
    ? posterLayout[posterLayout.length - 1].position[2] as number
    : -2;

  const getLocalPredictiveResults = useCallback((query: string) => {
    return rankSearchResults([
      ...baseMovies,
      ...seriesItems,
      ...israeliItems,
      ...favorites,
      ...watchHistory
    ], query).slice(0, 12);
  }, [baseMovies, favorites, israeliItems, seriesItems, watchHistory]);

  const cachePredictiveResults = useCallback((query: string, results: any[]) => {
    const cache = predictiveSearchCacheRef.current;
    if (cache.has(query)) {
      cache.delete(query);
    }
    cache.set(query, results);
    while (cache.size > 12) {
      const oldestKey = cache.keys().next().value;
      if (!oldestKey) break;
      cache.delete(oldestKey);
    }
  }, []);

  const runPredictiveSearch = useCallback(async (query: string, force = false) => {
    const normalizedQuery = normalizeSearchText(query);
    if (!force && !shouldTriggerPredictiveSearch(normalizedQuery)) {
      predictiveSearchRequestRef.current += 1;
      predictiveSearchAbortRef.current?.abort();
      predictiveSearchAbortRef.current = null;
      setIsSearchingTmdb(false);
      setSearchResults([]);
      return;
    }

    const localResults = getLocalPredictiveResults(query);
    setSearchResults(localResults);

    const cached = predictiveSearchCacheRef.current.get(normalizedQuery);
    if (cached) {
      setSearchResults(rankSearchResults([...localResults, ...cached], query).slice(0, 20));
      return;
    }

    predictiveSearchAbortRef.current?.abort();
    const controller = new AbortController();
    predictiveSearchAbortRef.current = controller;
    const requestId = predictiveSearchRequestRef.current + 1;
    predictiveSearchRequestRef.current = requestId;
    setIsSearchingTmdb(true);

    try {
      const data = await fetchApiJson(buildApiUrl(normalizedApiBase, `/api/search?q=${encodeURIComponent(query)}&type=all`), {
        signal: controller.signal
      });
      if (predictiveSearchRequestRef.current !== requestId) return;
      const remoteResults = Array.isArray(data.results) ? data.results : [];
      cachePredictiveResults(normalizedQuery, remoteResults);
      setSearchResults(rankSearchResults([...localResults, ...remoteResults], query).slice(0, 20));
    } catch (error: any) {
      if (error?.name === 'AbortError') return;
      if (predictiveSearchRequestRef.current === requestId) {
        setSearchResults(localResults);
      }
    } finally {
      if (predictiveSearchRequestRef.current === requestId) {
        if (predictiveSearchAbortRef.current === controller) {
          predictiveSearchAbortRef.current = null;
        }
        setIsSearchingTmdb(false);
      }
    }
  }, [cachePredictiveResults, getLocalPredictiveResults, normalizedApiBase]);

  useEffect(() => {
    if (!showSearch) return;
    const trimmedQuery = searchQuery.trim();
    if (!trimmedQuery) {
      predictiveSearchRequestRef.current += 1;
      predictiveSearchAbortRef.current?.abort();
      predictiveSearchAbortRef.current = null;
      setSearchResults([]);
      setIsSearchingTmdb(false);
      return;
    }
    if (!shouldTriggerPredictiveSearch(trimmedQuery)) {
      predictiveSearchRequestRef.current += 1;
      predictiveSearchAbortRef.current?.abort();
      predictiveSearchAbortRef.current = null;
      setSearchResults([]);
      setIsSearchingTmdb(false);
      return;
    }
    const timer = window.setTimeout(() => {
      void runPredictiveSearch(trimmedQuery);
    }, 280);
    return () => window.clearTimeout(timer);
  }, [runPredictiveSearch, searchQuery, showSearch]);

  useEffect(() => () => {
    predictiveSearchAbortRef.current?.abort();
  }, []);

  const handleTmdbSearch = () => {
    if (!searchQuery.trim()) return;
    void runPredictiveSearch(searchQuery, true);
  };

  const sideMenuGroups = useMemo(() => {
    const groups = buildSideMenuGroups({
      movieGenres: genreList,
      seriesGenres: getUniqueGenres(seriesItems),
      favoritesCount: favorites.length
    });

    return groups.map((group) => {
      if (group.id !== 'quick') return group;
      const searchItem = group.items.find((item) => item.id === 'quick-search');
      if (!searchItem) return group;
      return {
        ...group,
        items: [searchItem, ...group.items.filter((item) => item.id !== 'quick-search')]
      };
    });
  }, [favorites.length, genreList, seriesItems]);

  const activeMenuItemId = useMemo(() => getActiveMenuItemId({
    librarySection,
    activeGenreId,
    seriesGenreFilter,
    yearFilter,
    movieCategory,
    seriesCategory,
    israeliCategory,
    showSearch
  }), [librarySection, activeGenreId, israeliCategory, seriesGenreFilter, yearFilter, movieCategory, seriesCategory, showSearch]);

  const currentCorridorLabel = useMemo(() => {
    if (showSearch) return 'חיפוש חי';
    if (isFavoritesSection) return 'מועדפים';
    if (isSeriesSection) {
      if (seriesGenreFilter) return `סדרות • ${seriesGenreFilter}`;
      if (yearFilter !== 'all') return `סדרות • ${yearFilter}`;
      return seriesCategory === 'top_rated'
        ? 'סדרות • הכי מדורג'
        : seriesCategory === 'trending'
          ? 'סדרות • טרנדי'
          : seriesCategory === 'recently_active'
            ? 'סדרות • פעילות לאחרונה'
            : seriesCategory === 'random'
              ? 'סדרות • מיקס אקראי'
              : 'סדרות • פופולרי';
    }
    if (isIsraeliSection) {
      if (yearFilter !== 'all') return `ישראלי • ${yearFilter}`;
      return israeliCategory === 'top_rated'
        ? 'ישראלי • הכי מדורג'
        : israeliCategory === 'trending'
          ? 'ישראלי • טרנדי'
          : israeliCategory === 'recently_active'
            ? 'ישראלי • פעילות לאחרונה'
            : israeliCategory === 'random'
              ? 'ישראלי • מיקס אקראי'
              : 'ישראלי • פופולרי';
    }
    if (activeGenreId) {
      return `סרטים • ${genreList.find((genreItem: any) => genreItem.tmdbId === activeGenreId)?.name || 'ז׳אנר'}`;
    }
    if (yearFilter !== 'all') return `סרטים • ${yearFilter}`;
    return movieCategory === 'top_rated'
      ? 'סרטים • הכי מדורג'
      : movieCategory === 'trending'
        ? 'סרטים • טרנדי'
        : movieCategory === 'new_releases'
          ? 'סרטים • חדשים'
          : movieCategory === 'random'
            ? 'סרטים • מיקס אקראי'
            : 'סרטים • פופולרי';
  }, [activeGenreId, genreList, isFavoritesSection, isIsraeliSection, isSeriesSection, israeliCategory, movieCategory, seriesCategory, seriesGenreFilter, showSearch, yearFilter]);

  const activateMenuItem = (item: SideMenuItem) => {
    if (item.kind === 'settings') {
      setSettingsPanel(item.panel);
      setShowSettings(true);
      return;
    }

    if (item.kind === 'action') {
      if (item.action === 'exit') {
        CapApp.exitApp();
      }
      return;
    }

    const route = item.route;
    setNavContext(null);
    setSelectedMovie(null);
    setPosterContextMovie(null);
    closeTelegramSourceScreen();
    setSeriesGenreFilter(null);
    setActiveGenreId(null);
    setYearFilter(route.target === 'favorites' || route.target === 'search' ? 'all' : route.year ?? 'all');
    if (route.target === 'search') {
      resetSearchState();
      setShowSearch(true);
    } else {
      resetSearchState(true);
    }

    if (route.target === 'favorites') {
      setLibrarySection('favorites');
      setIsLocked(true);
      return;
    }

    if (route.target === 'search') {
      setLibrarySection('all');
      setMovieCategory('popular');
      setSortMode(getFeedSortMode('popular'));
      setIsLocked(true);
      return;
    }

    if (route.target === 'series') {
      setLibrarySection('series');
      setSeriesCategory(route.category ?? 'popular');
      setSortMode(getFeedSortMode(route.category));
      setSeriesGenreFilter(route.genreLabel ?? null);
      if (route.category === 'random') setShuffleSeed(Date.now());
      setIsLocked(true);
      return;
    }

    if (route.target === 'israeli') {
      setLibrarySection('israeli');
      setIsraeliCategory(route.category ?? 'popular');
      setSortMode(getFeedSortMode(route.category));
      if (route.category === 'random') setShuffleSeed(Date.now());
      setIsLocked(true);
      return;
    }

    setLibrarySection('all');
    setMovieCategory(route.category ?? 'popular');
    setSortMode(getFeedSortMode(route.category));
    setActiveGenreId(route.genreId ?? null);
    if (route.category === 'random') setShuffleSeed(Date.now());
    setIsLocked(true);
  };

  const openTelegramSearch = async (item: any) => {
    setIsSearchingTg(true);
    setShowCinemaScreen(true);
    try {
      const results = await searchTelegramForItem(item);
      setTgSearchResults(results);
    } finally {
      setIsSearchingTg(false);
    }
  };

  const closeTelegramSourceScreen = () => {
    stopBackgroundDownload();
    setShowCinemaScreen(false);
    setIsBuffering(false);
    setBufferProgress(0);
    setBufferingSourceKey(null);
    setPosterContextMovie(null);
  };

  const handlePlayVideo = async (telegramResult: any, mediaItem: any = selectedMovie) => {
    if (!mediaItem) return;
    saveToHistory(mediaItem);
    try {
      const prepared = await buildPreparedPlayback(telegramResult, mediaItem);
      await activatePreparedPlayback(prepared);
    } catch (error) {
      setIsBuffering(false);
      setBufferingSourceKey(null);
      setFetchError(error instanceof Error ? error.message : 'Playback failed to start.');
    }
  };

  const handleVideoTimeUpdate = () => undefined;
  const handleVideoLoadedMetadata = () => undefined;
  const handleVideoEnded = () => undefined;

  const dismissUpcomingAutoplay = () => {
    if (!activeMediaRef.current?.mediaItem) return;
    const activeKey = buildMediaKey(activeMediaRef.current.mediaItem);
    dismissedAutoPlayRef.current = activeKey;
    setPreparedNextMedia(null);
    setNextEpisodeOverlay(null);
  };

  useEffect(() => {
    prepareUpcomingEpisodeRef.current = prepareUpcomingEpisode;
  }, [prepareUpcomingEpisode]);

  useEffect(() => {
    dismissUpcomingAutoplayRef.current = dismissUpcomingAutoplay;
  }, [dismissUpcomingAutoplay]);

  useEffect(() => {
    closePlayerRef.current = closePlayer;
  }, [closePlayer]);

  useEffect(() => {
    activatePreparedPlaybackRef.current = activatePreparedPlayback;
  }, [activatePreparedPlayback]);

  useEffect(() => {
    const listenerHandles: Array<{ remove: () => void }> = [];

    const attach = async () => {
      listenerHandles.push(await NativePlayer.addListener('progress', (event) => {
        const playback = activeMediaRef.current;
        if (!playback?.mediaItem) return;

        const currentTime = Math.max(0, (event.positionMs || 0) / 1000);
        const duration = Math.max(0, (event.durationMs || 0) / 1000 || playback.durationSeconds || 0);
        playerPositionRef.current = currentTime;
        playerDurationRef.current = duration;
        if (duration <= 0) return;

        const now = Date.now();
        if (now - playbackProgressRef.current > 1500) {
          playbackProgressRef.current = now;
          persistPlaybackSnapshot(playback, currentTime, duration);
        }

        const currentKey = buildMediaKey(playback.mediaItem);
        if (
          playback.mediaItem.mediaType === 'episode'
          && shouldPrepareNextEpisode(
            currentTime,
            duration,
            !!preparedNextMediaRef.current || preloadAttemptKeyRef.current === currentKey,
            autoPlayNextEpisode
          )
          && dismissedAutoPlayRef.current !== currentKey
        ) {
          void prepareUpcomingEpisodeRef.current(playback.mediaItem);
        }

        if (preparedNextMediaRef.current && dismissedAutoPlayRef.current !== currentKey) {
          const remainingSeconds = Math.max(1, Math.ceil(duration - currentTime));
          setNextEpisodeOverlay((current) =>
            current?.title === preparedNextMediaRef.current?.mediaItem.title && current.remainingSeconds === remainingSeconds
              ? current
              : {
                  title: preparedNextMediaRef.current?.mediaItem.title || '',
                  remainingSeconds
                }
          );
        } else {
          setNextEpisodeOverlay(null);
        }
      }));

      listenerHandles.push(await NativePlayer.addListener('ended', () => {
        if (autoPlayNextEpisode && preparedNextMediaRef.current) {
          const nextPrepared = preparedNextMediaRef.current;
          void closePlayerRef.current(true)
            .then(() => activatePreparedPlaybackRef.current(nextPrepared))
            .catch(() => undefined);
          return;
        }
        void closePlayerRef.current(true);
      }));

      listenerHandles.push(await NativePlayer.addListener('backRequest', () => {
        void closePlayerRef.current(false);
      }));

      listenerHandles.push(await NativePlayer.addListener('autoplayDismissed', () => {
        dismissUpcomingAutoplayRef.current();
      }));

      listenerHandles.push(await NativePlayer.addListener('error', (event) => {
        setFetchError(event.message || 'Native playback failed.');
        void closePlayerRef.current(false);
      }));
    };

    void attach().catch(() => undefined);
    return () => {
      for (const handle of listenerHandles) {
        handle.remove();
      }
    };
  }, [autoPlayNextEpisode, persistPlaybackSnapshot]);

  useEffect(() => {
    if (!activeMedia) {
      void NativePlayer.updateAutoplayOverlay({ visible: false }).catch(() => undefined);
      return;
    }

    if (!autoPlayNextEpisode || !nextEpisodeOverlay) {
      void NativePlayer.updateAutoplayOverlay({ visible: false }).catch(() => undefined);
      return;
    }

    void NativePlayer.updateAutoplayOverlay({
      visible: true,
      title: nextEpisodeOverlay.title,
      remainingSeconds: nextEpisodeOverlay.remainingSeconds
    }).catch(() => undefined);
  }, [activeMedia, autoPlayNextEpisode, nextEpisodeOverlay]);

  const selectedMediaEntry = selectedMovie ? getMediaEntry(selectedMovie) : null;
  const posterContextEntry = posterContextMovie ? getMediaEntry(posterContextMovie) : null;
  const bufferingEntry = bufferingSourceKey ? playbackCacheMap[bufferingSourceKey] ?? null : null;
  const bufferTargetBytes = getPrebufferTargetBytes(bufferingEntry?.fileSizeBytes);
  const isCorridorInteractionBlocked =
    !!selectedMovie
    || showCinemaScreen
    || !!posterContextMovie
    || showSearch
    || showSettings
    || !!activeMedia
    || tgStatus === 'phoneInput'
    || tgStatus === 'codeInput'
    || tgStatus === 'passwordInput';

  return (
    <div className="w-full h-screen bg-black overflow-hidden relative text-white font-sans" dir="rtl">
      <Canvas camera={{ position: [0, 1.6, 2], fov: 75 }}>
        <ambientLight intensity={0.8} />
        <Suspense fallback={null}>
          <group>
             <mesh rotation={[-Math.PI/2, 0, 0]} position={[0,0,-100]}><planeGeometry args={[20, 300]} /><meshStandardMaterial color="#050505" /></mesh>
             <gridHelper args={[100, 50, '#00ffcc', '#001111']} position={[0, 0.01, -50]} />
              {renderedPosterLayout.map(({ movie, position, rotation }: any) => (
                <Poster
                  key={movie.uniqueId}
                  movie={movie}
                  isFocused={focusedId === movie.uniqueId}
                  isFavorited={getMediaEntry(movie).favorite}
                  isHeartFocused={focusedHeartId === movie.uniqueId}
                  watchStatus={getMediaEntry(movie).watchStatus}
                  position={position}
                  rotation={rotation}
                />
             ))}
             {isLoadingMore && (
               <Text position={[0, 1.6, lastPosterZ - 8]} fontSize={0.5} color="#00ffcc" anchorX="center">
                 טוען עוד תכנים...
               </Text>
             )}
          </group>
            <TVController
              posterLayout={posterLayout}
              isLocked={isLocked}
              onPosterSelect={handlePosterSelect}
              onPosterLongPress={handlePosterLongPress}
              onHeartToggle={handleHeartToggle}
              setFocusedId={setFocusedId}
              setFocusedHeartId={setFocusedHeartId}
            isAnyModalOpen={isCorridorInteractionBlocked}
             selectedMovie={selectedMovie}
             lastPosterZ={lastPosterZ}
             onNearEnd={handleNearEnd}
             onCameraMove={setCameraZ}
           />
        </Suspense>
      </Canvas>

      {/* Breadcrumb — shows where we are in the series hierarchy */}
      {isLocked && navContext && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 pointer-events-none flex gap-2 items-center text-white/80 text-lg bg-black/50 px-6 py-2 rounded-full backdrop-blur">
          <span className="cursor-pointer" onClick={() => { setNavContext(null); setLibrarySection('series'); }}>🏠 סדרות</span>
          <span className="text-[#00ffcc]">&rsaquo;</span>
          <span>{navContext.seriesTitle}</span>
          {navContext.type === 'episodes' && (
            <><span className="text-[#00ffcc]">&rsaquo;</span><span>{navContext.seasonTitle}</span></>
          )}
        </div>
      )}

      {/* Red Dot Reticle */}
      {isLocked && !selectedMovie && !showCinemaScreen && !posterContextMovie && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none flex items-center justify-center">
          <div className="w-2 h-2 bg-red-600 rounded-full shadow-[0_0_8px_4px_rgba(220,38,38,0.8)]"></div>
        </div>
      )}

      <AnimatePresence>
        {transitionLabel && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-30 pointer-events-none flex items-center justify-center bg-[radial-gradient(circle_at_center,rgba(0,255,204,0.12),rgba(0,0,0,0.92)_60%)]">
            <motion.div initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 1.08, opacity: 0 }} className="px-8 py-4 rounded-full border border-[#00ffcc]/40 bg-black/70 backdrop-blur-md text-[#00ffcc] text-xl tracking-[0.2em] uppercase shadow-[0_0_40px_rgba(0,255,204,0.18)]">
              {transitionLabel}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {tgStatus !== 'checking' && tgStatus !== 'loggedIn' && tgStatus !== 'loggedOut' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-[60] bg-black/95 flex flex-col items-center justify-center p-8 backdrop-blur-md" data-tv-scope="ui">
            <div className="bg-[#0a0a0a] border border-[#2AABEE]/40 rounded-[40px] p-12 flex flex-col items-center max-w-2xl shadow-[0_0_50px_rgba(42,171,238,0.2)]">
              <h2 className="text-4xl font-bold text-[#2AABEE] mb-4">התחברות לטלגרם</h2>
              
              {tgStatus === 'phoneInput' && (
                <>
                  <p className="text-xl text-gray-400 mb-8 text-center">כדי לצפות בסרטים ישירות מטלגרם, יש לאמת את חשבונך.</p>
                  <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} dir="ltr" className="w-full text-center text-4xl p-6 rounded-2xl bg-white/5 border border-white/10 focus:border-[#2AABEE] focus:bg-white/10 outline-none mb-8 transition-all" placeholder="+972501234567" />
                  <button onClick={() => {
                    setLoginError('');
                    setIsLoggingIn(true);
                    const base = apiBase.replace(/\/$/, '');
                    fetchApiJson(`${base}/api/tg/startLogin`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ phone }) })
                      .then((res) => { setLoginId(res.loginId); setTgStatus('codeInput'); setIsLoggingIn(false); })
                      .catch(err => { setLoginError(`שגיאה: ${err.message}`); setIsLoggingIn(false); });
                  }} disabled={isLoggingIn} className={`w-full py-5 ${isLoggingIn ? 'bg-gray-500' : 'bg-[#2AABEE]'} text-white text-2xl font-bold rounded-2xl shadow-xl transition-colors`}>{isLoggingIn ? 'מתחבר (אנא המתן)...' : 'שלח קוד אימות'}</button>
                </>
              )}
              
              {tgStatus === 'codeInput' && (
                <>
                  <p className="text-xl text-gray-400 mb-8 text-center">הזן את הקוד שקיבלת באפליקציית טלגרם למספר {phone}</p>
                  <input type="text" value={code} onChange={e => setCode(e.target.value)} dir="ltr" className="w-full text-center text-5xl tracking-[0.5em] p-6 rounded-2xl bg-white/5 border border-white/10 focus:border-green-500 outline-none mb-8" placeholder="12345" />
                  <button onClick={() => {
                     setLoginError('');
                     setIsLoggingIn(true);
                     const base = apiBase.replace(/\/$/, '');
                     fetchApiJson(`${base}/api/tg/submitCode`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ loginId, code }) })
                       .then((res) => {
                          if (res.requiresPassword) setTgStatus('passwordInput');
                          else {
                            safeSetString(localStorage, 'tg_session', res.sessionString);
                            setTgStatus('loggedIn');
                          }
                          setIsLoggingIn(false);
                       })
                       .catch(err => {
                          if (err.message.includes('password') || err.message.includes('2FA')) setTgStatus('passwordInput');
                          else setLoginError(`שגיאה בקוד: ${err.message}`);
                          setIsLoggingIn(false);
                       });
                  }} disabled={isLoggingIn} className={`w-full py-5 ${isLoggingIn ? 'bg-gray-500' : 'bg-green-500'} text-black text-2xl font-bold rounded-2xl shadow-xl transition-colors`}>{isLoggingIn ? 'מאמת...' : 'אמת והתחבר'}</button>
                </>
              )}

              {tgStatus === 'passwordInput' && (
                <>
                  <p className="text-xl text-gray-400 mb-8 text-center">החשבון מוגן בסיסמה (2FA). הזן סיסמה:</p>
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)} dir="ltr" className="w-full text-center text-4xl p-6 rounded-2xl bg-white/5 border border-white/10 focus:border-red-500 outline-none mb-8" />
                  <button onClick={() => {
                     setLoginError('');
                     setIsLoggingIn(true);
                     const base = apiBase.replace(/\/$/, '');
                     fetchApiJson(`${base}/api/tg/submitPassword`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ loginId, password }) })
                       .then((res) => {
                          safeSetString(localStorage, 'tg_session', res.sessionString);
                          setTgStatus('loggedIn');
                          setIsLoggingIn(false);
                       })
                       .catch(err => { setLoginError(`שגיאה בסיסמה: ${err.message}`); setIsLoggingIn(false); });
                  }} disabled={isLoggingIn} className={`w-full py-5 ${isLoggingIn ? 'bg-gray-500' : 'bg-red-500'} text-white text-2xl font-bold rounded-2xl shadow-xl transition-colors`}>{isLoggingIn ? 'מתחבר למערכת...' : 'שלח סיסמה'}</button>
                </>
              )}

              {loginError && <p className="text-red-400 mt-6 text-lg text-center break-words">{loginError}</p>}
              <button onClick={() => setTgStatus('loggedOut')} className="mt-8 text-gray-500 hover:text-white transition-colors text-xl">ביטול וחזרה</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showSearch && isLocked && !selectedMovie && !showCinemaScreen && (
          <motion.div initial={{ opacity: 0, y: -16, x: 12 }} animate={{ opacity: 1, y: 0, x: 0 }} exit={{ opacity: 0, y: -16, x: 12 }} className="absolute top-6 right-8 z-30 w-[30rem]" data-tv-scope="ui">
            <div className="rounded-[30px] border border-[#00ffcc]/20 bg-[linear-gradient(180deg,rgba(5,12,16,0.95),rgba(4,8,12,0.78))] p-5 shadow-[0_0_50px_rgba(0,255,204,0.12)] backdrop-blur-2xl">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-[#00ffcc]/12 p-3 text-[#7debd6]">
                  <Search size={20} />
                </div>
                <input
                  autoFocus
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') handleTmdbSearch();
                  }}
                  placeholder="שם סרט, סדרה או פרק"
                  className="flex-1 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-right text-lg text-white outline-none transition focus:border-[#00ffcc]/50 focus:bg-white/10"
                />
                <button onClick={handleTmdbSearch} className="rounded-2xl bg-[#00ffcc] px-5 py-3 text-base font-bold text-black transition hover:bg-[#7debd6]">
                  חפש
                </button>
                <button onClick={() => resetSearchState(true)} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white/80 transition hover:bg-white/10">
                  סגור
                </button>
              </div>
              <div className="mt-3 flex items-center justify-between text-sm text-white/45">
                <span>הקלד 3 תווים ומעלה כדי לקבל חיזוי מיידי בעברית ובאנגלית.</span>
                {isSearchingTmdb && <span className="text-[#7debd6]">טוען...</span>}
              </div>
              {shouldTriggerPredictiveSearch(searchQuery) && !isSearchingTmdb && searchResults.length === 0 && (
                <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/60">
                  עדיין אין התאמה. נסה לכתוב עוד אות או שם חלופי.
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <PosterContextMenu
        item={posterContextMovie}
        isFavorite={!!posterContextEntry?.favorite}
        onToggleFavorite={() => {
          if (!posterContextMovie) return;
          toggleFavoriteForItem(posterContextMovie, !posterContextEntry?.favorite);
          closePosterContextMenu();
        }}
        onClose={closePosterContextMenu}
      />

      <SideMenu
        isOpen={!isLocked && isRootCorridor}
        groups={sideMenuGroups}
        activeItemId={activeMenuItemId}
        currentLabel={currentCorridorLabel}
        onActivate={activateMenuItem}
        onClose={() => setIsLocked(true)}
      />

      {!isLocked && isRootCorridor && (
        <div className="absolute left-8 top-8 z-20 max-w-md rounded-[28px] border border-[#00ffcc]/12 bg-black/25 px-5 py-4 text-white/80 shadow-[0_0_30px_rgba(0,255,204,0.06)] backdrop-blur-md" data-tv-scope="ui">
          <p className="text-xs uppercase tracking-[0.3em] text-[#7debd6]">Root Corridor</p>
          <p className="mt-2 text-lg leading-8">בחירה בתפריט הימני מחליפה מיד את המסדרון. חזרה תסגור את המגירה ותשאיר אותך בתוך ה־3D.</p>
          <p className="mt-4 text-sm text-white/55">חיפוש זמין בתפריט הראשי בצד ימין, כפריט הראשון ברשימת המעבר המהיר.</p>
          {fetchError && <p className="mt-3 text-sm text-red-300">{fetchError}</p>}
        </div>
      )}

      <AnimatePresence>
        {showSettings && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-50 bg-black/95 flex flex-col items-center justify-center p-8 backdrop-blur-md" data-tv-scope="ui">
            <div className="bg-[#0a0a0a] border border-[#00ffcc]/40 rounded-[40px] p-12 flex flex-col items-center max-w-xl w-full shadow-2xl">
              <h2 className="text-4xl font-bold text-[#00ffcc] mb-8">הגדרות</h2>
              <div className="mb-8 grid w-full grid-cols-3 gap-3 rounded-[24px] border border-white/10 bg-white/5 p-2">
                {SETTINGS_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setSettingsPanel(tab.id)}
                    className={`rounded-[18px] px-4 py-3 text-sm font-semibold transition-colors ${settingsPanel === tab.id ? 'bg-[#00ffcc] text-black' : 'bg-transparent text-white/70 hover:bg-white/5 hover:text-white'}`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              
              {settingsPanel === 'updates' && otaVersion && (
                <div className="w-full bg-blue-500/20 border border-blue-500/50 rounded-2xl p-6 mb-8 flex flex-col gap-4 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-full h-1 bg-gradient-to-r from-blue-600 via-blue-400 to-transparent"></div>
                  <h3 className="text-2xl font-bold text-blue-300">עדכון גרסה זמין ({otaVersion})!</h3>
                  {otaDate && <p className="text-sm font-bold text-blue-400 mb-2">תאריך שחרור: {otaDate}</p>}
                  <p className="text-gray-300 text-lg leading-relaxed whitespace-pre-wrap">{otaMessage}</p>
                  <button disabled={isDownloadingOta} onClick={async () => {
                    try {
                      setIsDownloadingOta(true);
                      setOtaDownloadProgress(0);
                      const apkUrl = buildApiUrl(normalizedApiBase, '/apk/app-debug.apk');
                      
                      const listener = await Filesystem.addListener('progress', (progress) => {
                         setOtaDownloadProgress(Math.floor((progress.bytes / progress.contentLength) * 100));
                      });

                      const download = await Filesystem.downloadFile({
                        url: apkUrl,
                        path: 'holocinema_update.apk',
                        directory: Directory.Cache,
                        progress: true
                      });
                      
                      listener.remove();

                      await ApkInstaller.install({ filePath: download.path });
                    } catch (e: any) {
                      alert(`שגיאה בהתקנת העדכון: ${e.message}`);
                    } finally {
                      setIsDownloadingOta(false);
                      setOtaDownloadProgress(0);
                    }
                  }} className={`mt-4 w-full text-center py-4 text-white font-bold text-2xl rounded-xl shadow-[0_0_20px_rgba(37,99,235,0.6)] transition-colors border border-blue-400/50 ${isDownloadingOta ? 'bg-gray-600' : 'bg-blue-600 hover:bg-blue-500'}`}>
                    {isDownloadingOta ? `מוריד עדכון... ${otaDownloadProgress}%` : 'הורד והתקן עדכון עכשיו'}
                  </button>
                </div>
              )}

              {settingsPanel === 'general' && (
              <div className="mb-8 flex w-full flex-col gap-4">
                <div className="w-full bg-white/5 border border-white/10 rounded-2xl p-6 flex items-center justify-between gap-4">
                  <div className="text-right">
                    <h3 className="text-xl font-bold text-white">ניגון אוטומטי לפרק הבא</h3>
                    <p className="mt-1 text-sm text-gray-400">הנגן מכין את הפרק הבא כ-6 שניות לפני הסיום ונותן אפשרות לבטל.</p>
                  </div>
                  <button
                    onClick={() => setAutoPlayNextEpisode((value) => !value)}
                    className={`min-w-32 rounded-full px-5 py-3 text-sm font-bold transition-colors ${autoPlayNextEpisode ? 'bg-[#00ffcc] text-black' : 'bg-white/10 text-white border border-white/10'}`}
                  >
                    {autoPlayNextEpisode ? 'פעיל' : 'כבוי'}
                  </button>
                </div>
                <div className="w-full bg-white/5 border border-white/10 rounded-2xl p-6">
                  <div className="text-right">
                    <h3 className="text-xl font-bold text-white">Poster batch size</h3>
                    <p className="mt-1 text-sm text-gray-400">Start each corridor with a fast first batch, then quietly prefetch the next posters behind the scenes.</p>
                  </div>
                  <div className="mt-5 grid grid-cols-4 gap-3">
                    {POSTER_BATCH_SIZE_OPTIONS.map((size) => (
                      <button
                        key={size}
                        onClick={() => setPosterBatchSize(size)}
                        className={`rounded-2xl border px-4 py-4 text-base font-bold transition-colors ${posterBatchSize === size ? 'border-[#00ffcc]/40 bg-[#00ffcc] text-black' : 'border-white/10 bg-black/20 text-white/75 hover:bg-white/10 hover:text-white'}`}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              )}

              {settingsPanel === 'updates' && (
              <div className="w-full bg-white/5 border border-white/10 rounded-2xl p-6 mb-8 flex flex-col gap-6">
                {!otaVersion && (
                  <button onClick={() => {
                    fetchApiJson(buildApiUrl(normalizedApiBase, '/api/version'))
                      .then(data => {
                        if (isRemoteVersionNewer(CURRENT_VERSION, data.version)) {
                          setOtaVersion(data.version);
                          setOtaMessage(data.message);
                          setOtaDate(data.date || null);
                        } else {
                          alert(`אתה בגרסה העדכנית ביותר (${CURRENT_VERSION})`);
                        }
                      })
                      .catch((err) => alert(`שגיאה בבדיקת עדכונים: ${err.message}`));
                  }} className="w-full py-4 bg-gray-600/30 hover:bg-blue-600/40 text-blue-300 font-bold rounded-xl transition-colors border border-blue-500/30 mb-4">
                    חפש עדכונים ידנית
                  </button>
                )}
                <div className="rounded-2xl border border-white/10 bg-black/20 p-5 text-right text-sm text-white/65">
                  עדכונים זמינים ומותקנים רק מתוך תפריט המערכת כדי לשמור על מסדרון נקי ויציב.
                </div>
              </div>
              )}

              {settingsPanel === 'telegram' && (
              <div className="w-full bg-white/5 border border-white/10 rounded-2xl p-6 mb-8 flex flex-col gap-6">
                <div className="flex items-center justify-between border-t border-white/10 pt-6 mt-2">
                  <div>
                    <p className="text-gray-400 text-sm mb-1">חיבור טלגרם למכשיר זה</p>
                    <p className="text-2xl font-bold">{tgStatus === 'loggedIn' ? 'מחובר ✔️' : 'מנותק ❌'}</p>
                  </div>
                  {tgStatus === 'loggedIn' ? (
                    <button onClick={() => {
                       const base = apiBase.replace(/\/$/, '');
                       const sessionStr = safeGetString(localStorage, 'tg_session');
                       fetchApiJson(`${base}/api/tg/logout`, { method: 'POST', headers: { 'x-tg-session': sessionStr } })
                         .then(() => { safeRemove(localStorage, 'tg_session'); setTgStatus('loggedOut'); });
                    }} className="px-6 py-3 bg-red-500/20 text-red-400 border border-red-500/50 rounded-xl hover:bg-red-500 hover:text-white transition-colors">התנתק מהמכשיר</button>
                  ) : (
                    <button onClick={() => { setShowSettings(false); setTgStatus('phoneInput'); }} className="px-6 py-3 bg-[#2AABEE]/20 text-[#2AABEE] border border-[#2AABEE]/50 rounded-xl hover:bg-[#2AABEE] hover:text-white transition-colors">התחבר עכשיו</button>
                  )}
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 p-5 text-right text-sm text-white/65">
                  חיבור הטלגרם משפיע רק על חיפוש מקורות ההזרמה והכתוביות, בלי לשנות את מסדרון הגלישה.
                </div>
              </div>
              )}

              <button onClick={() => setShowSettings(false)} className="px-10 py-4 bg-white/10 hover:bg-white/20 rounded-2xl transition-colors w-full text-xl font-bold">סגור</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showCinemaScreen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 z-40 bg-black p-8 flex flex-col" data-tv-scope="ui">
            <div className="flex justify-between items-center mb-8 border-b border-white/10 pb-4">
              <h2 className="text-3xl font-bold text-blue-400">תוצאות מטלגרם: {selectedMovie?.title}</h2>
              <button onClick={closeTelegramSourceScreen}><X /></button>
            </div>
            {isBuffering ? (
              <div className="flex-1 flex flex-col items-center justify-center">
                <Loader2 className="animate-spin w-20 h-20 text-blue-500 mb-6" />
                <p className="text-2xl mb-3">Preparing playback buffer...</p>
                <p className="mb-8 text-base text-white/70">{formatBytes(bufferingEntry?.bytesDownloaded || 0)} / {formatBytes(bufferTargetBytes)} prebuffered</p>
                <div className="w-[500px] h-4 bg-gray-800 rounded-full overflow-hidden border border-white/10">
                  <motion.div initial={{ width: 0 }} animate={{ width: `${bufferProgress}%` }} className="h-full bg-blue-500 shadow-[0_0_20px_#3b82f6]" />
                </div>
                <p className="mt-4 text-blue-400 text-xl font-mono">{bufferProgress}%</p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-6 p-4">
                {isSearchingTg ? <div className="col-span-full text-center"><Loader2 className="animate-spin mx-auto w-16 h-16 text-blue-400" /></div> :
                  tgSearchResults.map((res, i) => (
                    <button autoFocus={i === 0} key={i} onClick={() => handlePlayVideo(res, selectedMovie)} className="bg-white/5 border border-white/10 p-8 rounded-[30px] text-right hover:border-blue-500 flex items-center gap-6 focus:ring-4 focus:ring-blue-400">
                      <Play fill="#3b82f6" size={32} />
                      <div className="flex-1 min-w-0"><h3 className="font-bold text-2xl truncate">{res.title}</h3><p className="text-gray-400 mt-2">{res.size} • {res.chatName}</p></div>
                    </button>
                  ))
                }
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {false && activeMedia && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-[100] bg-black" data-tv-scope="ui">
            <AnimatePresence>
              {nextEpisodeOverlay && autoPlayNextEpisode && (
                <motion.div
                  initial={{ opacity: 0, y: -12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  className="absolute top-8 right-8 z-[115] rounded-[28px] border border-white/15 bg-black/35 px-6 py-5 text-right shadow-[0_0_30px_rgba(0,255,204,0.15)] backdrop-blur-md"
                >
                  <div className="flex items-start gap-4">
                    <div className="rounded-full bg-[#00ffcc]/15 p-3 text-[#00ffcc]">
                      <SkipForward size={18} />
                    </div>
                    <div>
                      <p className="text-sm text-white/70">הפרק הבא מוכן</p>
                      <p className="mt-1 text-lg font-bold text-white">{nextEpisodeOverlay.title}</p>
                      <p className="mt-1 text-sm text-white/70">מתחיל בעוד {nextEpisodeOverlay.remainingSeconds} שניות</p>
                      <button autoFocus onClick={dismissUpcomingAutoplay} className="mt-4 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20">
                        לא מעוניין
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            <video 
               ref={videoRef}
               src={activeMedia.url} 
               controls 
               autoPlay 
               className="w-full h-full object-contain"
               crossOrigin="anonymous"
               onLoadedMetadata={handleVideoLoadedMetadata}
               onTimeUpdate={handleVideoTimeUpdate}
               onPause={handleVideoTimeUpdate}
               onEnded={handleVideoEnded}
            >
               {activeMedia.subtitleUrl && (
                 <track kind="subtitles" src={activeMedia.subtitleUrl} srcLang="he" label="Hebrew" default />
               )}
            </video>
            <button onClick={() => void closePlayer()} className="absolute top-8 left-8 z-[110] bg-black/50 p-4 rounded-full text-white hover:bg-white/20 transition-all font-bold">
               סגור נגן
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      {selectedMovie && !showCinemaScreen && (
        <div className="absolute inset-0 z-30 flex items-center justify-center p-8 bg-black/95" data-tv-scope="ui">
           <div className="bg-[#0a0a0a] border border-[#00ffcc]/40 rounded-[40px] p-12 flex gap-12 max-w-5xl shadow-2xl">
              <img src={selectedMovie.poster} className="w-80 rounded-3xl object-cover shadow-2xl" />
              <div className="flex flex-col flex-1">
                 <div className="mb-6 flex items-start justify-between gap-4">
                   <div>
                     <div className="mb-4 flex flex-wrap items-center gap-3">
                       {selectedMediaEntry && <WatchStatusChip status={selectedMediaEntry.watchStatus} />}
                        <button
                         onClick={() => toggleFavoriteForItem(selectedMovie)}
                         className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${selectedMediaEntry?.favorite ? 'border-pink-400/40 bg-pink-500/15 text-pink-100' : 'border-white/10 bg-white/5 text-white/80 hover:bg-white/10'}`}
                       >
                         {selectedMediaEntry?.favorite ? <HeartOff size={16} /> : <Heart size={16} />}
                         <span>{selectedMediaEntry?.favorite ? 'הסר ממועדפים' : 'הוסף למועדפים'}</span>
                       </button>
                     </div>
                     <h2 className="text-5xl font-bold">{selectedMovie.title}</h2>
                   </div>
                 </div>
                 <p className="text-xl text-gray-400 mb-10 leading-relaxed overflow-y-auto max-h-48">{selectedMovie.desc}</p>
                 <div className="flex gap-6 mt-auto">
                    <button onClick={() => {
                      if (tgStatus !== 'loggedIn') {
                        setTgStatus('phoneInput');
                        return;
                      }
                      void openTelegramSearch(selectedMovie);
                    }} className="flex-1 py-5 bg-[#2AABEE] text-white text-xl font-bold rounded-2xl shadow-xl focus:ring-4 focus:ring-white">לצפייה</button>
                    <button onClick={() => setSelectedMovie(null)} className="px-10 py-5 bg-white/10 rounded-2xl focus:ring-4 focus:ring-white">חזור</button>
                 </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
}
