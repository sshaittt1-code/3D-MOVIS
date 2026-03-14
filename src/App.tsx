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
import { applyCatalogFilters, getUniqueGenres, SORT_OPTIONS, YEAR_OPTIONS, type LibrarySection, type SortMode, type YearFilter } from './utils/catalog';
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

// Native Video Player replaced MX Player requirement

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
  init.headers = {
    ...init.headers,
    'x-tg-session': sessionStr
  };
  const response = await fetch(path, init);
  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error(bodyText || `Request failed with ${response.status}`);
  }
  if (bodyText.trim().startsWith('<')) throw new Error('API returned HTML. Check API Base URL.');
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

  useEffect(() => {
    const clearLongPress = () => {
      if (longPressTimeoutRef.current) {
        window.clearTimeout(longPressTimeoutRef.current);
        longPressTimeoutRef.current = null;
      }
      selectKeyDownAtRef.current = null;
      longPressTriggeredRef.current = false;
    };

    const handleInput = (e: KeyboardEvent) => {
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
      if (e.key === 'ArrowLeft') keys.current.left = false;
      else if (e.key === 'ArrowRight') keys.current.right = false;
      else if (isTvSelectKey(e)) {
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
  }, [isLocked, onPosterLongPress, onPosterSelect, onHeartToggle, isAnyModalOpen, selectedMovie]);

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
  const [selectedMovie, setSelectedMovie] = useState<any>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [focusedHeartId, setFocusedHeartId] = useState<string | null>(null);
  const [genre, setGenre] = useState('הכל');
  const [showCinemaScreen, setShowCinemaScreen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [tgSearchResults, setTgSearchResults] = useState<any[]>([]);
  const [isSearchingTg, setIsSearchingTg] = useState(false);
  const [navContext, setNavContext] = useState<NavCtx>(null);
  const [librarySection, setLibrarySection] = useState<LibrarySection>('all');
  const [sortMode, setSortMode] = useState<SortMode>('popular');
  const [yearFilter, setYearFilter] = useState<YearFilter>('all');
  const [seriesGenreFilter, setSeriesGenreFilter] = useState<string | null>(null);
  const [movieCategory, setMovieCategory] = useState<FeedCategory>('popular');
  const [seriesCategory, setSeriesCategory] = useState<FeedCategory>('popular');
  const [isIsraeliOnly, setIsIsraeliOnly] = useState(false);
  const [settingsPanel, setSettingsPanel] = useState<SettingsPanel>('general');
  const [activeMenuItemId, setActiveMenuItemId] = useState('quick-movies');
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

  useEffect(() => {
    safeSetJson(localStorage, MEDIA_STATE_STORAGE_KEY, mediaStateMap);
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
    const streamUrl = buildApiUrl(normalizedApiBase, sourceInfo.streamUrl || `/api/tg/stream/${telegramResult.peerId}/${telegramResult.id}?session=${sessionStr}`);
    const downloadUrl = buildApiUrl(normalizedApiBase, sourceInfo.downloadUrl || sourceInfo.streamUrl || `/api/tg/stream/${telegramResult.peerId}/${telegramResult.id}?session=${sessionStr}`);
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
      subtitleUrl = subData.results?.[0]
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
    setActiveMedia({
      ...prepared,
      url,
      cacheUri: latestEntry?.cacheUri || prepared.cacheUri,
      resumePositionSeconds: latestEntry?.lastPositionSeconds || prepared.resumePositionSeconds || 0
    });
  };

  const closePlayer = async (completedPlayback = false) => {
    stopBackgroundDownload();
    if (bufferIntervalRef.current !== null) {
      window.clearInterval(bufferIntervalRef.current);
      bufferIntervalRef.current = null;
    }
    if (activeMedia?.mediaItem && videoRef.current) {
      const currentTime = videoRef.current.currentTime || 0;
      const duration = Number.isFinite(videoRef.current.duration) ? videoRef.current.duration : 0;
      upsertMediaState(activeMedia.mediaItem, (entry) => updateProgressState(activeMedia.mediaItem, entry, currentTime, duration));
      upsertPlaybackCache(activeMedia.sourceKey, {
        sourceKey: activeMedia.sourceKey,
        mediaKey: buildMediaKey(activeMedia.mediaItem),
        title: activeMedia.title,
        mediaType: activeMedia.mediaItem.mediaType,
        peerId: activeMedia.peerId,
        messageId: activeMedia.messageId,
        streamUrl: activeMedia.streamUrl,
        downloadUrl: activeMedia.downloadUrl,
        cachePath: activeMedia.cachePath,
        cacheUri: activeMedia.cacheUri,
        fileName: activeMedia.fileName,
        mimeType: activeMedia.mimeType,
        fileSizeBytes: activeMedia.fileSizeBytes,
        bytesDownloaded: getPlaybackCacheEntry(activeMedia.sourceKey)?.bytesDownloaded || 0,
        durationSeconds: duration || activeMedia.durationSeconds,
        lastPositionSeconds: currentTime,
        isComplete: getPlaybackCacheEntry(activeMedia.sourceKey)?.isComplete || false
      });
    }

    const cacheEntry = activeMedia ? getPlaybackCacheEntry(activeMedia.sourceKey) : null;
    const watched = activeMedia ? getMediaEntry(activeMedia.mediaItem).watchStatus === 'watched' || completedPlayback : completedPlayback;
    if (shouldDeleteCompletedCache(cacheEntry, watched)) {
      await deletePlaybackCacheFile(cacheEntry);
      setPlaybackCacheMap((current) => removePlaybackCacheEntry(current, cacheEntry!.sourceKey));
    }
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
  const preloadAttemptKeyRef = useRef<string | null>(null);
  const dismissedAutoPlayRef = useRef<string | null>(null);
  const displayMoviesRef = useRef<any[]>([]);
  const bufferIntervalRef = useRef<number | null>(null);
  const downloadAbortRef = useRef<AbortController | null>(null);
  const prebufferResolverRef = useRef<(() => void) | null>(null);
  const playbackCacheMapRef = useRef<PlaybackCacheMap>(playbackCacheMap);
  const categoryRequestMapRef = useRef<Map<string, Promise<{ items: any[]; hasMore: boolean }>>>(new Map());
  const categoryPrefetchRef = useRef<Set<string>>(new Set());
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

  useEffect(() => () => {
    if (bufferIntervalRef.current !== null) {
      window.clearInterval(bufferIntervalRef.current);
      bufferIntervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    const persistCurrentPlayback = () => {
      if (!activeMedia || !videoRef.current) return;
      const currentTime = videoRef.current.currentTime || 0;
      const duration = Number.isFinite(videoRef.current.duration) ? videoRef.current.duration : activeMedia.durationSeconds || 0;
      upsertPlaybackCache(activeMedia.sourceKey, {
        sourceKey: activeMedia.sourceKey,
        mediaKey: buildMediaKey(activeMedia.mediaItem),
        title: activeMedia.title,
        mediaType: activeMedia.mediaItem.mediaType,
        peerId: activeMedia.peerId,
        messageId: activeMedia.messageId,
        streamUrl: activeMedia.streamUrl,
        downloadUrl: activeMedia.downloadUrl,
        cachePath: activeMedia.cachePath,
        cacheUri: activeMedia.cacheUri,
        fileName: activeMedia.fileName,
        mimeType: activeMedia.mimeType,
        fileSizeBytes: activeMedia.fileSizeBytes,
        bytesDownloaded: getPlaybackCacheEntry(activeMedia.sourceKey)?.bytesDownloaded || 0,
        durationSeconds: duration,
        lastPositionSeconds: currentTime,
        isComplete: getPlaybackCacheEntry(activeMedia.sourceKey)?.isComplete || false
      });
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
  }, [activeMedia]);

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
      if (showSearch) { setShowSearch(false); setSearchQuery(''); setSearchResults([]); return; }
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
      if (tgStatus === 'phoneInput' || tgStatus === 'codeInput' || tgStatus === 'passwordInput') {
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
      // Catch conventional keyboard ESC for Web compatibility
      if (e.key === 'Escape' || e.key === 'Backspace') {
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
        if (tgStatus === 'phoneInput' || tgStatus === 'codeInput' || tgStatus === 'passwordInput') {
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
          setShowSearch(false);
          setSearchQuery('');
          setSearchResults([]);
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
      
      // Let standard HTML buttons/inputs handle the OK click native to Android Webview
      const activeTag = document.activeElement?.tagName.toLowerCase();
      const isInputFocused = activeTag === 'input' || activeTag === 'button' || activeTag === 'a';
      if (isInputFocused) return;
      
      // If we are showing the corridor and nothing selected yet, start playing
      if (!isLocked && !selectedMovie && !showCinemaScreen && !showSearch) {
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

  const isMovieCorridor = genre !== '׳¡׳“׳¨׳•׳×' && genre !== '׳׳•׳¢׳“׳₪׳™׳' && genre !== '׳¦׳₪׳™׳•׳× ׳׳—׳¨׳•׳ ׳•׳×' && !navContext;

  const isMoviesSection = librarySection === 'all';
  const isSeriesSection = librarySection === 'series';
  const isFavoritesSection = librarySection === 'favorites';
  const isHistorySection = librarySection === 'history';
  const isBrowseSection = isMoviesSection || isSeriesSection;
  const isRootCorridor = !navContext && !selectedMovie && !showCinemaScreen && !activeMedia && !showSettings && tgStatus !== 'phoneInput' && tgStatus !== 'codeInput' && tgStatus !== 'passwordInput';

  const buildMoviesFeedPath = useCallback((page: number) => {
    const params = new URLSearchParams({
      page: String(page),
      page_size: String(posterBatchSize),
      category: movieCategory
    });
    if (activeGenreId) params.set('genre_id', String(activeGenreId));
    if (yearFilter !== 'all') params.set('year', String(yearFilter));
    if (isIsraeliOnly) params.set('israeli', '1');
    return buildApiUrl(normalizedApiBase, `/api/movies?${params.toString()}`);
  }, [activeGenreId, isIsraeliOnly, movieCategory, normalizedApiBase, posterBatchSize, yearFilter]);

  const buildSeriesFeedPath = useCallback((page: number) => {
    const params = new URLSearchParams({
      page: String(page),
      page_size: String(posterBatchSize),
      category: seriesCategory
    });
    if (yearFilter !== 'all') params.set('year', String(yearFilter));
    return buildApiUrl(normalizedApiBase, `/api/series?${params.toString()}`);
  }, [normalizedApiBase, posterBatchSize, seriesCategory, yearFilter]);

  const fetchCategoryPage = useCallback(async ({
    cacheKey,
    path,
    field
  }: {
    cacheKey: string;
    path: string;
    field: 'movies' | 'series';
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

  const prefetchCategoryPage = useCallback((options: { cacheKey: string; path: string; field: 'movies' | 'series' }) => {
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

  // Initial movie fetch
  useEffect(() => {
    if (genre === 'סדרות' || genre === 'מועדפים' || genre === 'צפיות אחרונות') return;
    if (!isMoviesSection) return;
    const cacheKey = buildCategoryCacheKey({
      target: 'movies',
      category: movieCategory,
      genreId: activeGenreId,
      year: String(yearFilter),
      israeliOnly: isIsraeliOnly,
      page: 1,
      batchSize: posterBatchSize
    });
    setContentPage(1);
    setHasMore(true);
    setIsLoadingMore(false);
    setFetchError(null);
    setPosterContextMovie(null);
    let cancelled = false;
    fetchCategoryPage({ cacheKey, path: buildMoviesFeedPath(1), field: 'movies' })
      .then((data) => {
        if (cancelled) return;
        setBaseMovies(data.items.length > 0 ? data.items : BASE_MOVIES);
        setHasMore(data.hasMore ?? false);
        if (data.hasMore) {
          prefetchCategoryPage({
            cacheKey: buildCategoryCacheKey({
              target: 'movies',
              category: movieCategory,
              genreId: activeGenreId,
              year: String(yearFilter),
              israeliOnly: isIsraeliOnly,
              page: 2,
              batchSize: posterBatchSize
            }),
            path: buildMoviesFeedPath(2),
            field: 'movies'
          });
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setFetchError(`Network error: ${err.message}`);
        setBaseMovies(BASE_MOVIES);
        setShowSettings(true);
      });
    return () => {
      cancelled = true;
    };
  }, [activeGenreId, buildMoviesFeedPath, fetchCategoryPage, genre, isIsraeliOnly, isMoviesSection, movieCategory, posterBatchSize, prefetchCategoryPage, yearFilter]);

  // Load more movies when reaching the end
  const handleNearEnd = () => {
    if (isBrowseSection && displayMovies.length === 0) return;
    if (!isBrowseSection) return;
    if (isLoadingMore || !hasMore || navContext || showSearch) return;
    const nextPage = contentPage + 1;
    const cacheKey = buildCategoryCacheKey(isSeriesSection
      ? {
          target: 'series',
          category: seriesCategory,
          genreLabel: seriesGenreFilter,
          year: String(yearFilter),
          page: nextPage,
          batchSize: posterBatchSize
        }
      : {
          target: 'movies',
          category: movieCategory,
          genreId: activeGenreId,
          year: String(yearFilter),
          israeliOnly: isIsraeliOnly,
          page: nextPage,
          batchSize: posterBatchSize
        });
    setIsLoadingMore(true);
    fetchCategoryPage({
      cacheKey,
      path: isSeriesSection ? buildSeriesFeedPath(nextPage) : buildMoviesFeedPath(nextPage),
      field: isSeriesSection ? 'series' : 'movies'
    })
      .then((data) => {
        if (isSeriesSection) {
          setSeriesItems((prev) => [...prev, ...data.items]);
        } else {
          setBaseMovies((prev) => [...prev, ...data.items]);
        }
        setContentPage(nextPage);
        setHasMore(data.hasMore ?? false);
        if (data.hasMore) {
          prefetchCategoryPage({
            cacheKey: buildCategoryCacheKey(isSeriesSection
              ? {
                  target: 'series',
                  category: seriesCategory,
                  genreLabel: seriesGenreFilter,
                  year: String(yearFilter),
                  page: nextPage + 1,
                  batchSize: posterBatchSize
                }
              : {
                  target: 'movies',
                  category: movieCategory,
                  genreId: activeGenreId,
                  year: String(yearFilter),
                  israeliOnly: isIsraeliOnly,
                  page: nextPage + 1,
                  batchSize: posterBatchSize
                }),
            path: isSeriesSection ? buildSeriesFeedPath(nextPage + 1) : buildMoviesFeedPath(nextPage + 1),
            field: isSeriesSection ? 'series' : 'movies'
          });
        }
      })
      .catch((err) => {
        setFetchError(err instanceof Error ? err.message : 'Failed to load more content.');
      })
      .finally(() => setIsLoadingMore(false));
  };

  // Fetch series when genre switches to 'סדרות'
  useEffect(() => {
    if (!isSeriesSection) return;
    const cacheKey = buildCategoryCacheKey({
      target: 'series',
      category: seriesCategory,
      genreLabel: seriesGenreFilter,
      year: String(yearFilter),
      page: 1,
      batchSize: posterBatchSize
    });
    setContentPage(1);
    setHasMore(true);
    setIsLoadingMore(false);
    setPosterContextMovie(null);
    let cancelled = false;
    fetchCategoryPage({ cacheKey, path: buildSeriesFeedPath(1), field: 'series' })
      .then((data) => {
        if (cancelled) return;
        setSeriesItems(data.items || []);
        setHasMore(data.hasMore ?? false);
        setFetchError(data.items?.length ? null : 'No series were found to load.');
        if (data.hasMore) {
          prefetchCategoryPage({
            cacheKey: buildCategoryCacheKey({
              target: 'series',
              category: seriesCategory,
              genreLabel: seriesGenreFilter,
              year: String(yearFilter),
              page: 2,
              batchSize: posterBatchSize
            }),
            path: buildSeriesFeedPath(2),
            field: 'series'
          });
        }
      })
      .catch((err) => {
        if (!cancelled) setFetchError(`Series error: ${err.message}`);
      });
    return () => {
      cancelled = true;
    };
  }, [buildSeriesFeedPath, fetchCategoryPage, isSeriesSection, posterBatchSize, prefetchCategoryPage, seriesCategory, seriesGenreFilter, yearFilter]);

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
    if (isSeriesSection) { enterSeries(movie); return; }
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
    if (genre === 'מועדפים') {
      return favorites.map((m: any, i: number) => ({ ...m, uniqueId: `fav-${m.id}-${m.mediaType}-${i}` }));
    }
    if (genre === 'צפיות אחרונות') {
      return watchHistory.map((m: any, i: number) => ({ ...m, uniqueId: `hist-${m.id}-${m.mediaType}-${i}` }));
    }
    if (genre === 'סדרות') return seriesItems.map((m: any, i: number) => ({ ...m, uniqueId: `ser-${m.id}-${i}` }));
    const filtered = applyCatalogFilters((baseMovies && baseMovies.length > 0 ? baseMovies : BASE_MOVIES) || [], {
      sortMode,
      yearFilter,
      randomSeed: shuffleSeed
    });
    return filtered.map((m: any, i: number) => ({ ...m, uniqueId: `${m.id}-${i}` }));
  }, [baseMovies, favorites, genre, isFavoritesSection, isHistorySection, isSeriesSection, navContext, searchResults, seriesGenreFilter, seriesItems, showSearch, shuffleSeed, sortMode, watchHistory, yearFilter]);

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

  // Trigger TMDB search
  const handleTmdbSearch = () => {
    if (!searchQuery.trim()) return;
    setIsSearchingTmdb(true);
    fetchApiJson(buildApiUrl(normalizedApiBase, `/api/search?q=${encodeURIComponent(searchQuery)}&type=${isSeriesSection ? 'tv' : 'all'}`))
      .then(data => { setSearchResults(data.results || []); setIsSearchingTmdb(false); })
      .catch(() => setIsSearchingTmdb(false));
  };

  const sideMenuGroups = useMemo(() => buildSideMenuGroups({
    movieGenres: genreList,
    seriesGenres: getUniqueGenres(seriesItems),
    favoritesCount: favorites.length
  }), [favorites.length, genreList, seriesItems]);

  useEffect(() => {
    setActiveMenuItemId(getActiveMenuItemId({
      librarySection,
      activeGenreId,
      seriesGenreFilter,
      yearFilter,
      movieCategory,
      seriesCategory,
      isIsraeliOnly,
      showSearch
    }));
  }, [librarySection, activeGenreId, seriesGenreFilter, yearFilter, movieCategory, seriesCategory, isIsraeliOnly, showSearch]);

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
    if (isIsraeliOnly) return 'ישראלי';
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
  }, [activeGenreId, genreList, isFavoritesSection, isIsraeliOnly, isSeriesSection, movieCategory, seriesCategory, seriesGenreFilter, showSearch, yearFilter]);

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
    setActiveMenuItemId(item.id);
    setNavContext(null);
    setSelectedMovie(null);
    setPosterContextMovie(null);
    closeTelegramSourceScreen();
    setSeriesGenreFilter(null);
    setActiveGenreId(null);
    setYearFilter(route.target === 'favorites' || route.target === 'search' ? 'all' : route.year ?? 'all');
    setShowSearch(route.target === 'search');
    if (route.target !== 'search') {
      setSearchQuery('');
      setSearchResults([]);
    }

    if (route.target === 'favorites') {
      setLibrarySection('favorites');
      setGenre('מועדפים');
      setIsIsraeliOnly(false);
      setIsLocked(true);
      return;
    }

    if (route.target === 'search') {
      setLibrarySection('all');
      setGenre('הכל');
      setMovieCategory('popular');
      setIsIsraeliOnly(false);
      setIsLocked(true);
      return;
    }

    if (route.target === 'series') {
      setLibrarySection('series');
      setGenre('סדרות');
      setSeriesCategory(route.category ?? 'popular');
      setSortMode(route.category === 'top_rated' ? 'rating' : route.category === 'random' ? 'random' : 'popular');
      setSeriesGenreFilter(route.genreLabel ?? null);
      setIsIsraeliOnly(false);
      if (route.category === 'random') setShuffleSeed(Date.now());
      setIsLocked(true);
      return;
    }

    setLibrarySection('all');
    setGenre(route.israeliOnly ? 'ישראלי' : 'הכל');
    setMovieCategory(route.category ?? 'popular');
    setSortMode(route.category === 'top_rated' ? 'rating' : route.category === 'random' ? 'random' : 'popular');
    setActiveGenreId(route.genreId ?? null);
    setIsIsraeliOnly(!!route.israeliOnly);
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

  const handleVideoTimeUpdate = () => {
    if (!activeMedia?.mediaItem || !videoRef.current) return;
    const video = videoRef.current;
    const currentTime = video.currentTime || 0;
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    if (duration <= 0) return;

    const now = Date.now();
    if (now - playbackProgressRef.current > 1500) {
      playbackProgressRef.current = now;
      upsertMediaState(activeMedia.mediaItem, (entry) => updateProgressState(activeMedia.mediaItem, entry, currentTime, duration));
      upsertPlaybackCache(activeMedia.sourceKey, {
        sourceKey: activeMedia.sourceKey,
        mediaKey: buildMediaKey(activeMedia.mediaItem),
        title: activeMedia.title,
        mediaType: activeMedia.mediaItem.mediaType,
        peerId: activeMedia.peerId,
        messageId: activeMedia.messageId,
        streamUrl: activeMedia.streamUrl,
        downloadUrl: activeMedia.downloadUrl,
        cachePath: activeMedia.cachePath,
        cacheUri: activeMedia.cacheUri,
        fileName: activeMedia.fileName,
        mimeType: activeMedia.mimeType,
        fileSizeBytes: activeMedia.fileSizeBytes,
        bytesDownloaded: getPlaybackCacheEntry(activeMedia.sourceKey)?.bytesDownloaded || 0,
        durationSeconds: duration || activeMedia.durationSeconds,
        lastPositionSeconds: currentTime,
        isComplete: getPlaybackCacheEntry(activeMedia.sourceKey)?.isComplete || false
      });
    }

    const currentKey = buildMediaKey(activeMedia.mediaItem);
    if (activeMedia.mediaItem.mediaType === 'episode' && shouldPrepareNextEpisode(currentTime, duration, !!preparedNextMedia || preloadAttemptKeyRef.current === currentKey, autoPlayNextEpisode) && dismissedAutoPlayRef.current !== currentKey) {
      void prepareUpcomingEpisode(activeMedia.mediaItem);
    }

    if (preparedNextMedia && dismissedAutoPlayRef.current !== currentKey) {
      const remainingSeconds = Math.max(1, Math.ceil(duration - currentTime));
      setNextEpisodeOverlay((current) =>
        current?.title === preparedNextMedia.mediaItem.title && current.remainingSeconds === remainingSeconds
          ? current
          : {
              title: preparedNextMedia.mediaItem.title,
              remainingSeconds
            }
      );
    }
  };

  const dismissUpcomingAutoplay = () => {
    if (!activeMedia?.mediaItem) return;
    const activeKey = buildMediaKey(activeMedia.mediaItem);
    dismissedAutoPlayRef.current = activeKey;
    setPreparedNextMedia(null);
    setNextEpisodeOverlay(null);
  };

  const handleVideoLoadedMetadata = () => {
    if (!activeMedia || !videoRef.current) return;
    const duration = Number.isFinite(videoRef.current.duration) ? videoRef.current.duration : activeMedia.durationSeconds;
    upsertPlaybackCache(activeMedia.sourceKey, {
      sourceKey: activeMedia.sourceKey,
      mediaKey: buildMediaKey(activeMedia.mediaItem),
      title: activeMedia.title,
      mediaType: activeMedia.mediaItem.mediaType,
      peerId: activeMedia.peerId,
      messageId: activeMedia.messageId,
      streamUrl: activeMedia.streamUrl,
      downloadUrl: activeMedia.downloadUrl,
      cachePath: activeMedia.cachePath,
      cacheUri: activeMedia.cacheUri,
      fileName: activeMedia.fileName,
      mimeType: activeMedia.mimeType,
      fileSizeBytes: activeMedia.fileSizeBytes,
      bytesDownloaded: getPlaybackCacheEntry(activeMedia.sourceKey)?.bytesDownloaded || 0,
      durationSeconds: duration || 0,
      lastPositionSeconds: activeMedia.resumePositionSeconds || 0,
      isComplete: getPlaybackCacheEntry(activeMedia.sourceKey)?.isComplete || false
    });
    if (activeMedia.resumePositionSeconds > 0) {
      videoRef.current.currentTime = activeMedia.resumePositionSeconds;
    }
  };

  const handleVideoEnded = () => {
    if (activeMedia?.mediaItem && videoRef.current) {
      const duration = Number.isFinite(videoRef.current.duration) ? videoRef.current.duration : activeMedia.mediaItem.durationSeconds || 0;
      upsertMediaState(activeMedia.mediaItem, (entry) => updateProgressState(activeMedia.mediaItem, entry, duration, duration));
    }

    if (autoPlayNextEpisode && preparedNextMedia) {
      void closePlayer(true).then(() => activatePreparedPlayback(preparedNextMedia)).catch(() => undefined);
      return;
    }

    void closePlayer(true);
  };

  const selectedMediaEntry = selectedMovie ? getMediaEntry(selectedMovie) : null;
  const posterContextEntry = posterContextMovie ? getMediaEntry(posterContextMovie) : null;
  const bufferingEntry = bufferingSourceKey ? playbackCacheMap[bufferingSourceKey] ?? null : null;
  const bufferTargetBytes = getPrebufferTargetBytes(bufferingEntry?.fileSizeBytes);

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
            isAnyModalOpen={!!selectedMovie || showCinemaScreen || !!posterContextMovie}
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
          <span className="cursor-pointer" onClick={() => { setNavContext(null); setLibrarySection('series'); setGenre('סדרות'); }}>🏠 סדרות</span>
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
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-[60] bg-black/95 flex flex-col items-center justify-center p-8 backdrop-blur-md">
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
          <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} className="absolute top-6 right-1/2 z-30 w-[42rem] translate-x-1/2">
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
                <button onClick={() => { setShowSearch(false); setSearchQuery(''); setSearchResults([]); }} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white/80 transition hover:bg-white/10">
                  סגור
                </button>
              </div>
              <div className="mt-3 flex items-center justify-between text-sm text-white/45">
                <span>התוצאות מחליפות את המסדרון בזמן אמת</span>
                {isSearchingTmdb && <span className="text-[#7debd6]">טוען...</span>}
              </div>
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
        <div className="absolute left-8 top-8 z-20 max-w-md rounded-[28px] border border-[#00ffcc]/12 bg-black/25 px-5 py-4 text-white/80 shadow-[0_0_30px_rgba(0,255,204,0.06)] backdrop-blur-md">
          <p className="text-xs uppercase tracking-[0.3em] text-[#7debd6]">Root Corridor</p>
          <p className="mt-2 text-lg leading-8">בחירה בתפריט הימני מחליפה מיד את המסדרון. חזרה תסגור את המגירה ותשאיר אותך בתוך ה־3D.</p>
          {fetchError && <p className="mt-3 text-sm text-red-300">{fetchError}</p>}
        </div>
      )}

      <AnimatePresence>
        {showSettings && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-50 bg-black/95 flex flex-col items-center justify-center p-8 backdrop-blur-md">
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
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 z-40 bg-black p-8 flex flex-col">
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
        {activeMedia && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-[100] bg-black">
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
        <div className="absolute inset-0 z-30 flex items-center justify-center p-8 bg-black/95">
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
