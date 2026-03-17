import React, { useState, useEffect, useRef, Suspense, useMemo, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Text, SpotLight } from '@react-three/drei';
import * as THREE from 'three';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Settings, Film, X, Loader2, Eye, Clock3 } from 'lucide-react';
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { textureManager } from './utils/TextureManager';
import { applyCatalogFilters, getApiYearFilter, getUniqueGenres, type LibrarySection, type SortMode, type YearFilter } from './utils/catalog';
import { buildMediaKey, createDefaultMediaStateEntry, MEDIA_STATE_STORAGE_KEY, migrateLegacyMediaState, type MediaStateEntry, type WatchStatus, updateProgressState } from './utils/mediaState';
import { AUTOPLAY_PRELOAD_SECONDS, findNextEpisodeInSeason, findNextSeason, shouldPrepareNextEpisode } from './utils/nextEpisode';
import { readAutoPlayNextEpisode, writeAutoPlayNextEpisode } from './utils/playerSettings';
import { SideMenu } from './components/SideMenu';
import { PosterContextMenu } from './components/PosterContextMenu';
import { AppSettingsPanel } from './components/AppSettingsPanel';
import { CinemaGate } from './components/CinemaGate';
import { TelegramAuthWizard } from './components/TelegramAuthWizard';
import { TelegramConsolePanel } from './components/TelegramConsolePanel';
import { UpdateConsolePanel } from './components/UpdateConsolePanel';
import { CorridorShell } from './components/CorridorShell';
import { CorridorFocusOverlay } from './components/CorridorFocusOverlay';
import { CorridorPosterSlot } from './components/CorridorPosterSlot';
import { buildSideMenuGroups, getActiveMenuItemId, type FeedCategory, type MenuRoute, type SettingsPanel, type SideMenuItem } from './utils/menuConfig';
import { safeGetJson, safeGetString, safeRemove, safeSetJson, safeSetString } from './utils/safeStorage';
import { buildApiUrl, fetchApiJson } from './utils/apiClient';
import {
  buildCategoryCacheKey,
  compactCategoryCacheStorage,
  getCategoryCacheEntry,
  writeCategoryCacheEntry
} from './utils/categoryCache';
import { DEFAULT_POSTER_BATCH_SIZE, POSTER_BATCH_SIZE_OPTIONS, readPosterBatchSize, writePosterBatchSize } from './utils/posterBatchSettings';
import { LONG_PRESS_DURATION_MS, classifyPressDuration } from './utils/longPress';
import { applyEditingKeyToInput, isEditableTextTarget } from './utils/keyboardActions';
import { normalizeSearchText, rankSearchResults, shouldTriggerPredictiveSearch } from './utils/searchNormalize';
import { NativePlayer, type NativePlayerErrorEvent, type NativePlayerProgressEvent } from './utils/nativePlayer';
import {
  compactPlaybackCacheStorage,
  isPlayableFromCache,
  readPlaybackCacheMap,
  removePlaybackCacheEntry,
  upsertPlaybackCacheEntry,
  writePlaybackCacheMap
} from './utils/playbackCache';
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
  getLastPosterZ,
  getNearEndTriggerZ
} from './utils/corridorEngine';
import {
  FALLBACK_LIBRARY,
  configureContentModelRuntime,
  getCatalogFallbackMediaType,
  mergeCorridorItems,
  normalizeCatalogPage,
  normalizeEpisodePage,
  type CatalogPageResult,
  type CorridorItem,
  normalizeCatalogResponse,
  normalizeSeasonPage,
  type FeedTarget,
  type NavContext
} from './utils/contentModel';
import {
  buildRootRequestKey,
  getActiveGenreFilterForSection,
  getFeedTargetForSection,
  resolveRootRouteState
} from './utils/corridorFeed';
import {
  buildEpisodesNavContext,
  buildSeasonsNavContext,
  getCorridorScopeKey,
  getHierarchyMeta,
  getSeriesSelectionAction,
  stepOutOfNavContext
} from './utils/seriesHierarchy';
import { shouldHandleGlobalTvBack } from './utils/tvNavigation';
import { resolveMenuSelectionAction } from './utils/menuTransitions';
import {
  DEFAULT_ROOT_CATALOG_STATE,
  resolveAppBackAction,
  resolveAppShellLayer
} from './utils/appShell';
import {
  buildPreparedPlayback,
  buildSubtitleSearchQuery,
  buildTelegramSearchQuery,
  getResumePositionSeconds,
  isPlayableMediaItem,
  pickDefaultSubtitle,
  type PreparedPlayback,
  type TelegramAuthStatus,
  type TelegramSearchResult,
  type TelegramSourceInfo,
  type TelegramSubtitleResult
} from './utils/telegramPlayer';
import {
  buildIsraeliPhoneE164,
  isLikelyValidIsraeliPhoneDigits,
  mapTelegramServerStageToPendingStage,
  mapTelegramServerStageToStatus,
  normalizeIsraeliPhoneDigits,
  resolveTelegramStatusAfterRefresh,
  type TelegramAuthPendingStage,
  type TelegramLoginServerStage,
  TELEGRAM_DEFAULT_COUNTRY_CODE,
  translateTelegramAuthError
} from './utils/telegramLogin';
import {
  resolveRuntimePerformanceProfile,
  shouldRunBackgroundWarmup
} from './utils/runtimePerformance';
import {
  DEFAULT_API_BASE_URL,
  ensurePersistedStorageContract,
  LAST_GOOD_FEED_STORAGE_KEY,
  PERSISTED_STORAGE_KEYS
} from './utils/persistedState';
import { persistResolvedApiBase, resolveApiBase } from './utils/apiBase';
import { BACK_EVENT_DEBOUNCE_MS, shouldIgnoreBackEvent } from './utils/backNavigation';
import {
  buildPosterSlotWindow,
  getCorridorTierConfig,
  IMAX_CORRIDOR_SHELL_CONFIG,
  resolvePosterTextureIntents,
  type PosterTextureState
} from './utils/corridorScene';
import {
  classifySearchSource,
  deriveLibraryCollections,
  getSearchSourceLabel,
  summarizeSearchResultsBySource
} from './utils/libraryState';
import {
  isTelegramDialogMediaType,
  type TelegramDialogCategory
} from './utils/telegramDialogs';
import { ApkInstaller, downloadUpdateApk, removeDownloadedUpdateApk } from './utils/apkInstaller';
import {
  createInitialUpdateState,
  hasAvailableUpdate,
  isCurrentVersionSupported,
  normalizeUpdateManifest,
  resolveUpdatePhase,
  UPDATE_CHECK_INTERVAL_MS,
  type DownloadedApkInfo
} from './utils/updateManager';
import {
  getTvDirection,
  hasLocalBackHandlerTarget,
  isTvNavigationKey,
  isTvSelectKey,
  isUiScopeTarget,
  stopTvEvent
} from './utils/tvRemote';

// --- API Helpers ---
const API_BASE = resolveApiBase(typeof localStorage !== 'undefined' ? localStorage : undefined);

if (typeof localStorage !== 'undefined') {
  ensurePersistedStorageContract(localStorage);
}

const blurActiveElement = () => {
  const activeElement = document.activeElement as HTMLElement | null;
  activeElement?.blur?.();
};

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

type ActivePlayback = PreparedPlayback & {
  url: string;
};

const formatBytes = (bytes: number) => {
  if (!bytes) return '0 MB';
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
      const direction = getTvDirection(e);
      if (direction === 'up') {
        setTargetPos(p => new THREE.Vector3(p.x, p.y, p.z - STEP_SIZE));
        targetRotY.current = 0;
      } else if (direction === 'down') {
        setTargetPos(p => new THREE.Vector3(p.x, p.y, Math.min(p.z + STEP_SIZE, CORRIDOR_INITIAL_CAMERA_Z + 3)));
        targetRotY.current = 0;
      } else if (direction === 'left') {
        keys.current.left = true;
      } else if (direction === 'right') {
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
      const direction = getTvDirection(e);
      if (direction === 'left') keys.current.left = false;
      else if (direction === 'right') keys.current.right = false;
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
  const [textureFailed, setTextureFailed] = useState(false);
  const [showText, setShowText] = useState(false);
  const groupRef = useRef<THREE.Group>(null!);
  const previewFetchAttempted = useRef(false);
  const fullFetchAttempted = useRef(false);
  const previewUrl = movie.posterThumb || movie.poster;
  const fullUrl = movie.poster || movie.posterThumb;
  const placeholderColor = useMemo(() => {
    const source = `${movie.mediaType || 'movie'}:${movie.title || movie.id || 'poster'}`;
    let hash = 0;
    for (let index = 0; index < source.length; index += 1) {
      hash = (hash * 31 + source.charCodeAt(index)) >>> 0;
    }
    const hue = hash % 360;
    return `hsl(${hue} 58% 22%)`;
  }, [movie.id, movie.mediaType, movie.title]);
  const placeholderAccent = useMemo(() => {
    const source = `${movie.year || 0}:${movie.genre || movie.title || 'poster'}`;
    let hash = 17;
    for (let index = 0; index < source.length; index += 1) {
      hash = (hash * 37 + source.charCodeAt(index)) >>> 0;
    }
    const hue = hash % 360;
    return `hsl(${hue} 82% 62%)`;
  }, [movie.genre, movie.title, movie.year]);

  const applyLoadedTexture = useCallback((nextTexture: THREE.Texture | null) => {
    if (!nextTexture) return;
    setTextureFailed(false);
    setTexture(nextTexture);
  }, []);

  const markTextureFailure = useCallback(() => {
    setTextureFailed(true);
  }, []);

  useEffect(() => {
    previewFetchAttempted.current = false;
    fullFetchAttempted.current = false;
    setTextureFailed(false);

    const cachedFull = fullUrl ? textureManager.getTexture(fullUrl) : null;
    const cachedPreview = previewUrl ? textureManager.getTexture(previewUrl) : null;
    if (cachedFull) {
      applyLoadedTexture(cachedFull);
      return;
    }
    if (cachedPreview) {
      applyLoadedTexture(cachedPreview);
      return;
    }
    setTexture(null);
  }, [applyLoadedTexture, fullUrl, previewUrl]);

  useFrame((state) => { 
    if (!groupRef.current) return;
    const targetScale = isFocused ? 1.4 : 1; 
    groupRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, 1), 0.1); 
    const distZ = state.camera.position.z - groupRef.current.position.z;
    const isVisible = distZ > -15 && distZ < 35; 
    const isTextVisible = isVisible && distZ < 15;
    groupRef.current.visible = isVisible;
    if (showText !== isTextVisible) setShowText(isTextVisible);

    if (isVisible && previewUrl && !previewFetchAttempted.current) {
      previewFetchAttempted.current = true;
      textureManager.loadTexture(previewUrl).then((tex) => applyLoadedTexture(tex)).catch(() => {
        markTextureFailure();
      });
    }

    const shouldUpgradeToFull = isFocused || distZ < 12;
    if (isVisible && shouldUpgradeToFull && fullUrl && fullUrl !== previewUrl && !fullFetchAttempted.current) {
      fullFetchAttempted.current = true;
      textureManager.loadTexture(fullUrl).then((tex) => applyLoadedTexture(tex)).catch(() => {
        markTextureFailure();
      });
    } else if (isVisible && fullUrl === previewUrl && fullUrl && !fullFetchAttempted.current) {
      fullFetchAttempted.current = true;
      textureManager.loadTexture(fullUrl).then((tex) => applyLoadedTexture(tex)).catch(() => {
        markTextureFailure();
      });
    }
  });

  const heartColor = isFavorited ? '#ff3355' : isHeartFocused ? '#ff8899' : '#555555';
  const watchBadgeColor = watchStatus === 'watched' ? '#22c55e' : watchStatus === 'in_progress' ? '#f59e0b' : null;
  const watchBadgeGlyph = watchStatus === 'watched' ? '◉' : watchStatus === 'in_progress' ? '◷' : null;

  return (
    <group position={position} rotation={rotation} ref={groupRef}>
      <mesh name="poster_mesh" userData={{ uniqueId: movie.uniqueId }} position={[0, 0, 0.01]}>
        <planeGeometry args={[2.5, 3.75]} />
        <meshStandardMaterial
          map={texture}
          color={texture ? (isFocused ? '#ffffff' : '#acacac') : placeholderColor}
          emissive={texture ? '#000000' : placeholderAccent}
          emissiveIntensity={texture ? 0 : (isFocused ? 0.28 : 0.14)}
        />
      </mesh>
      <mesh name="poster_mesh" userData={{ uniqueId: movie.uniqueId }} position={[0, 0, -0.02]}>
        <planeGeometry args={[2.6, 3.85]} />
        <meshBasicMaterial color={isFocused ? '#00ffcc' : '#111111'} />
      </mesh>
      {!texture && (
        <>
          <mesh position={[0, 0.95, 0.04]}>
            <planeGeometry args={[1.9, 0.12]} />
            <meshBasicMaterial color={placeholderAccent} transparent opacity={0.9} />
          </mesh>
          <Text
            position={[0, 0.18, 0.05]}
            fontSize={0.34}
            color="#f8fafc"
            anchorX="center"
            anchorY="middle"
            maxWidth={1.9}
            textAlign="center"
          >
            {movie.title}
          </Text>
          <Text
            position={[0, -1.05, 0.05]}
            fontSize={0.18}
            color={textureFailed ? '#fca5a5' : '#cbd5f5'}
            anchorX="center"
            anchorY="middle"
            maxWidth={1.95}
            textAlign="center"
          >
            {textureFailed
              ? `פוסטר לא זמין${movie.year ? ` · ${movie.year}` : ''}`
              : [movie.genre, movie.year].filter(Boolean).join(' · ') || 'טוען פוסטר...'}
          </Text>
        </>
      )}
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
  const [telegramItems, setTelegramItems] = useState<CorridorItem[]>(() => readInitialFeedItems('telegram'));
  const [selectedMovie, setSelectedMovie] = useState<CorridorItem | null>(null);
  const [isLocked, setIsLocked] = useState(true);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [focusedHeartId, setFocusedHeartId] = useState<string | null>(null);
  const [showCinemaScreen, setShowCinemaScreen] = useState(false);
  const [showTelegramAuthModal, setShowTelegramAuthModal] = useState(false);
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
  const [telegramCategory, setTelegramCategory] = useState<TelegramDialogCategory>(DEFAULT_ROOT_CATALOG_STATE.telegramCategory);
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

  const [apiBase] = useState(() => resolveApiBase(typeof localStorage !== 'undefined' ? localStorage : undefined));
  const normalizedApiBase = useMemo(() => apiBase.replace(/\/$/, ''), [apiBase]);
  useEffect(() => {
    configureContentModelRuntime({ apiBase: normalizedApiBase });
  }, [normalizedApiBase]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [appVersion, setAppVersion] = useState('1.0.0');
  const [appBuild, setAppBuild] = useState('1');
  const [appPackageId, setAppPackageId] = useState('com.holocinema.tv');
  const [updateState, setUpdateState] = useState(() => createInitialUpdateState());
  const [showUpdatePrompt, setShowUpdatePrompt] = useState(false);

  const [tgStatus, setTgStatus] = useState<TelegramAuthStatus>('checking');
  const [activeMedia, setActiveMedia] = useState<ActivePlayback | null>(null);
  const [playbackCacheMap, setPlaybackCacheMap] = useState(() => compactPlaybackCacheStorage(localStorage));
  const [tgConfigured, setTgConfigured] = useState(true);
  const [tgBusy, setTgBusy] = useState(false);
  const [tgError, setTgError] = useState<string | null>(null);
  const [tgLoginId, setTgLoginId] = useState<string | null>(null);
  const [tgAuthPendingStage, setTgAuthPendingStage] = useState<TelegramAuthPendingStage>('idle');
  const [tgPhoneDigits, setTgPhoneDigits] = useState('');
  const [tgCode, setTgCode] = useState('');
  const [tgPassword, setTgPassword] = useState('');
  const [tgSearchQuery, setTgSearchQuery] = useState('');
  const [tgSources, setTgSources] = useState<TelegramSearchResult[]>([]);
  const [tgSubtitleResults, setTgSubtitleResults] = useState<TelegramSubtitleResult[]>([]);
  const [tgSelectedSubtitleUrl, setTgSelectedSubtitleUrl] = useState<string | null>(null);
  const [isSearchingTelegramSources, setIsSearchingTelegramSources] = useState(false);
  const [isSearchingTelegramSubtitles, setIsSearchingTelegramSubtitles] = useState(false);
  const [preparingTelegramSourceId, setPreparingTelegramSourceId] = useState<number | null>(null);
  const [preparedNextPlayback, setPreparedNextPlayback] = useState<PreparedPlayback | null>(null);
  const tgPhoneE164 = useMemo(() => buildIsraeliPhoneE164(tgPhoneDigits), [tgPhoneDigits]);
  const canStartTelegramLogin = useMemo(() => isLikelyValidIsraeliPhoneDigits(tgPhoneDigits), [tgPhoneDigits]);

  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<CorridorItem[]>([]);
  const [isSearchingTmdb, setIsSearchingTmdb] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [posterContextMovie, setPosterContextMovie] = useState<any>(null);
  const [appVisible, setAppVisible] = useState(
    () => typeof document === 'undefined' ? true : document.visibilityState !== 'hidden'
  );

  const predictiveSearchRequestRef = useRef(0);
  const predictiveSearchAbortRef = useRef<AbortController | null>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchReturnToSidebarRef = useRef(false);
  const settingsReturnToSidebarRef = useRef(false);
  const telegramAuthReturnToSidebarRef = useRef(false);
  const telegramPendingRouteRef = useRef<Extract<MenuRoute, { target: 'telegram' }> | null>(null);
  const telegramLoginPollAbortRef = useRef<AbortController | null>(null);
  const telegramLoginPollRunRef = useRef(0);
  const mediaStateMapRef = useRef(mediaStateMap);
  const playbackCacheMapRef = useRef(playbackCacheMap);
  const activeMediaRef = useRef<ActivePlayback | null>(null);
  const preparedNextPlaybackRef = useRef<PreparedPlayback | null>(null);
  const preparedNextNavContextRef = useRef<NavContext>(null);
  const autoplayDismissedRef = useRef(false);
  const nextEpisodePreparePromiseRef = useRef<Promise<void> | null>(null);
  const telegramContextKeyRef = useRef('');
  const telegramStatusRequestRef = useRef(0);
  const updateResumeInstallRef = useRef(false);
  const lastUpdateCheckAtRef = useRef(0);
  const runtimePerformanceProfile = useMemo(() => resolveRuntimePerformanceProfile(), []);
  const isNativePlatform = useMemo(() => Capacitor.isNativePlatform(), []);
  const corridorTierConfig = useMemo(
    () => getCorridorTierConfig(runtimePerformanceProfile.tier),
    [runtimePerformanceProfile.tier]
  );
  const [corridorTextureStates, setCorridorTextureStates] = useState<Record<string, PosterTextureState>>({});
  const lastInitialPosterPrefetchKeyRef = useRef<string | null>(null);
  const lastVisiblePosterPrefetchKeyRef = useRef<string | null>(null);
  const [showCorridorDebug] = useState(() => {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    return params.get('hc_debug') === '1' || safeGetString(localStorage, PERSISTED_STORAGE_KEYS.corridorDebug) === '1';
  });

  useEffect(() => { mediaStateMapRef.current = mediaStateMap; safeSetJson(localStorage, MEDIA_STATE_STORAGE_KEY, mediaStateMap); }, [mediaStateMap]);
  useEffect(() => { playbackCacheMapRef.current = playbackCacheMap; writePlaybackCacheMap(localStorage, playbackCacheMap); }, [playbackCacheMap]);
  useEffect(() => { activeMediaRef.current = activeMedia; }, [activeMedia]);
  useEffect(() => { preparedNextPlaybackRef.current = preparedNextPlayback; }, [preparedNextPlayback]);
  useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    persistResolvedApiBase(localStorage, apiBase);
  }, [apiBase]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    console.log('API_BASE =', normalizedApiBase);
  }, [normalizedApiBase]);
  useEffect(() => {
    compactCategoryCacheStorage(localStorage);
  }, []);
  useEffect(() => {
    const handleVisibilityChange = () => {
      setAppVisible(document.visibilityState !== 'hidden');
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  const libraryCollections = useMemo(() => deriveLibraryCollections({
    mediaStateMap,
    catalogItems: [...baseMovies, ...seriesItems, ...israeliItems, ...telegramItems]
  }), [mediaStateMap, baseMovies, seriesItems, israeliItems, telegramItems]);
  const favorites = libraryCollections.favorites;
  const watchHistory = libraryCollections.history;
  const continueWatching = libraryCollections.continueWatching;
  const searchPool = libraryCollections.searchPool;
  const searchSpotlight = libraryCollections.spotlight;
  const searchSourceLookup = libraryCollections.sourceLookup;
  const librarySourceSummaries = libraryCollections.sourceSummaries;
  const searchResultSourceSummaries = useMemo(
    () => summarizeSearchResultsBySource(searchResults, searchSourceLookup),
    [searchResults, searchSourceLookup]
  );
  const searchPreviewItems = useMemo(
    () => (searchQuery.trim() ? searchResults.slice(0, 5) : searchSpotlight),
    [searchQuery, searchResults, searchSpotlight]
  );
  const shellSnapshot = useMemo(() => ({
    hasActiveMedia: Boolean(activeMedia),
    hasPosterContextMovie: Boolean(posterContextMovie),
    showTelegramAuthModal,
    hasSelectedMovie: Boolean(selectedMovie),
    showCinemaScreen,
    showSearch,
    hasNavContext: Boolean(navContext),
    showSettings,
    isSidebarOpen: !isLocked
  }), [activeMedia, posterContextMovie, showTelegramAuthModal, selectedMovie, showCinemaScreen, showSearch, navContext, showSettings, isLocked]);
  const activeShellLayer = useMemo(() => resolveAppShellLayer(shellSnapshot), [shellSnapshot]);
  const isAnyShellOverlayOpen = activeShellLayer !== 'corridor' && activeShellLayer !== 'sidebar' && activeShellLayer !== 'navContext';
  const showSlimMenu = activeShellLayer === 'corridor' || activeShellLayer === 'sidebar';
  const shellSnapshotRef = useRef(shellSnapshot);
  const activeShellLayerRef = useRef(activeShellLayer);
  const lastBackHandledAtRef = useRef<number | null>(null);

  useEffect(() => {
    shellSnapshotRef.current = shellSnapshot;
  }, [shellSnapshot]);

  useEffect(() => {
    activeShellLayerRef.current = activeShellLayer;
    if (import.meta.env.DEV) {
      console.log('NAV_STATE', activeShellLayer);
    }
  }, [activeShellLayer]);

  useEffect(() => {
    document.documentElement.dataset.hcPlatform = 'android-tv';
    document.body.classList.add('hc-tv-app');
    document.body.classList.toggle('hc-modal-open', isAnyShellOverlayOpen);
    return () => {
      document.body.classList.remove('hc-tv-app');
      document.body.classList.remove('hc-modal-open');
      delete document.documentElement.dataset.hcPlatform;
    };
  }, [isAnyShellOverlayOpen]);

  const handlePosterBatchSizeChange = useCallback((value: number) => {
    setPosterBatchSize(value);
    writePosterBatchSize(localStorage, value);
  }, []);

  const handleAutoPlayNextEpisodeChange = useCallback((value: boolean) => {
    setAutoPlayNextEpisode(value);
    writeAutoPlayNextEpisode(localStorage, value);
  }, []);

  const refreshInstallPermissionState = useCallback(async () => {
    if (!isNativePlatform) {
      setUpdateState((prev) => ({ ...prev, permissionState: 'granted' }));
      return 'granted' as const;
    }

    try {
      const permission = await ApkInstaller.getInstallPermissionStatus();
      const permissionState = permission.canInstall ? 'granted' : 'needs_permission';
      setUpdateState((prev) => ({ ...prev, permissionState }));
      return permissionState;
    } catch {
      setUpdateState((prev) => ({ ...prev, permissionState: 'unknown' }));
      return 'unknown' as const;
    }
  }, [isNativePlatform]);

  const installDownloadedUpdate = useCallback(async (downloadedApk?: DownloadedApkInfo | null) => {
    const apk = downloadedApk ?? updateState.downloadedApk;
    if (!apk) {
      setUpdateState((prev) => ({
        ...prev,
        phase: 'error',
        error: 'לא נמצא קובץ APK מוכן להתקנה.'
      }));
      return;
    }

    if (!isNativePlatform) {
      setShowUpdatePrompt(false);
      window.open(updateState.manifest?.apkUrl || apk.uri, '_blank', 'noopener,noreferrer');
      return;
    }

    try {
      setShowUpdatePrompt(false);
      setUpdateState((prev) => ({ ...prev, phase: 'installing', error: null }));
      await ApkInstaller.install({ filePath: apk.uri });
    } catch (error: any) {
      setUpdateState((prev) => ({
        ...prev,
        phase: 'ready_to_install',
        error: error?.message || 'פתיחת מתקין Android נכשלה.'
      }));
    }
  }, [isNativePlatform, updateState.downloadedApk, updateState.manifest?.apkUrl]);

  const checkForUpdates = useCallback(async (options: { quiet?: boolean; force?: boolean } = {}) => {
    const now = Date.now();
    if (!options.force && now - lastUpdateCheckAtRef.current < UPDATE_CHECK_INTERVAL_MS / 2) {
      return;
    }

    if (!options.quiet) {
      setUpdateState((prev) => ({ ...prev, phase: 'checking', error: null }));
    } else {
      setUpdateState((prev) => ({ ...prev, error: null }));
    }

    try {
      const payload = await fetchApiJson(
        buildApiUrl(normalizedApiBase, '/api/update-manifest'),
        {},
        { timeoutMs: 7000, retryCount: 1, retryDelayMs: 500 }
      );
      const manifest = normalizeUpdateManifest(payload, normalizedApiBase);
      if (!manifest) {
        throw new Error('קובץ העדכון שהשרת החזיר אינו תקין.');
      }

      const permissionState = await refreshInstallPermissionState();
      const supportedVersion = isCurrentVersionSupported(appVersion, manifest);
      const nextPhase = resolveUpdatePhase(appVersion, manifest);
      const updateAvailable = hasAvailableUpdate(appVersion, manifest);
      const nowChecked = Date.now();

      lastUpdateCheckAtRef.current = nowChecked;
      setUpdateState((prev) => ({
        ...prev,
        manifest,
        lastCheckedAt: nowChecked,
        permissionState,
        phase: supportedVersion ? nextPhase : 'available',
        error: supportedVersion
          ? null
          : 'הגרסה שמותקנת אצלך ישנה מדי ביחס לשחרור האחרון. מומלץ לעדכן עכשיו.',
        downloadedApk:
          prev.downloadedApk && prev.manifest?.version === manifest.version
            ? prev.downloadedApk
            : null
      }));

      if (isNativePlatform && updateAvailable && manifest.apkAvailable) {
        setShowUpdatePrompt(true);
      }
      if (!updateAvailable) {
        setShowUpdatePrompt(false);
      }
    } catch (error: any) {
      lastUpdateCheckAtRef.current = Date.now();
      setUpdateState((prev) => ({
        ...prev,
        phase: prev.downloadedApk ? 'ready_to_install' : 'error',
        error: options.quiet && prev.error ? prev.error : (error?.message || 'בדיקת העדכונים נכשלה.'),
        lastCheckedAt: Date.now()
      }));
    }
  }, [appVersion, isNativePlatform, normalizedApiBase, refreshInstallPermissionState]);

  const startUpdateInstallFlow = useCallback(async () => {
    const manifest = updateState.manifest;
    if (!manifest || !manifest.apkAvailable) {
      setUpdateState((prev) => ({
        ...prev,
        phase: 'error',
        error: 'אין כרגע APK זמין להתקנה.'
      }));
      return;
    }

    setShowUpdatePrompt(false);
    setUpdateState((prev) => ({
      ...prev,
      phase: 'downloading',
      error: null,
      progressPercent: null
    }));

    try {
      const permissionState = await refreshInstallPermissionState();
      const downloaded = await downloadUpdateApk(manifest.apkUrl);
      const verification = isNativePlatform
        ? await ApkInstaller.verifyPackageArchive({
            filePath: downloaded.uri,
            packageName: manifest.packageId || appPackageId,
            expectedSizeBytes: manifest.apkSizeBytes
          })
        : {
            exists: true,
            isApk: true,
            sizeBytes: downloaded.sizeBytes,
            packageName: manifest.packageId || appPackageId,
            versionName: manifest.version,
            versionCode: manifest.versionCode,
            matchesPackage: true
          };

      if (!verification.exists || !verification.isApk) {
        throw new Error('הקובץ שהורד לא זוהה כ-APK תקין.');
      }
      if (!verification.matchesPackage) {
        throw new Error('קובץ העדכון אינו תואם לחבילת האפליקציה המותקנת.');
      }

      const downloadedApk: DownloadedApkInfo = {
        ...downloaded,
        versionName: verification.versionName ?? manifest.version,
        versionCode: verification.versionCode ?? manifest.versionCode,
        packageName: verification.packageName ?? manifest.packageId ?? appPackageId
      };

      setUpdateState((prev) => ({
        ...prev,
        downloadedApk,
        permissionState,
        phase: 'ready_to_install',
        error: null
      }));

      if (permissionState === 'granted') {
        await installDownloadedUpdate(downloadedApk);
      } else {
        updateResumeInstallRef.current = true;
      }
    } catch (error: any) {
      await removeDownloadedUpdateApk();
      setUpdateState((prev) => ({
        ...prev,
        downloadedApk: null,
        phase: 'error',
        error: error?.message || 'הורדת העדכון נכשלה.'
      }));
    }
  }, [appPackageId, installDownloadedUpdate, isNativePlatform, refreshInstallPermissionState, updateState.manifest]);

  const openUpdatePermissionSettings = useCallback(async () => {
    if (!isNativePlatform) return;
    updateResumeInstallRef.current = true;
    try {
      await ApkInstaller.openInstallPermissionSettings();
    } catch (error: any) {
      setUpdateState((prev) => ({
        ...prev,
        phase: 'error',
        error: error?.message || 'לא ניתן לפתוח את מסך הרשאות ההתקנה.'
      }));
    }
  }, [isNativePlatform]);

  useEffect(() => {
    let cancelled = false;

    const loadAppInfo = async () => {
      try {
        const info = await CapApp.getInfo();
        if (cancelled) return;
        setAppVersion(info.version || '1.0.0');
        setAppBuild(info.build || '1');
        setAppPackageId(info.id || 'com.holocinema.tv');
      } catch {
        if (cancelled) return;
        setAppVersion((prev) => prev || '1.0.0');
      }
    };

    void loadAppInfo();
    void refreshInstallPermissionState();

    return () => {
      cancelled = true;
    };
  }, [refreshInstallPermissionState]);

  useEffect(() => {
    void checkForUpdates({ quiet: true, force: true });
  }, [checkForUpdates]);

  useEffect(() => {
    if (!appVisible) return;
    const timer = window.setInterval(() => {
      void checkForUpdates({ quiet: true, force: true });
    }, UPDATE_CHECK_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [appVisible, checkForUpdates]);

  useEffect(() => {
    const handleAppState = async ({ isActive }: { isActive: boolean }) => {
      if (!isActive) return;

      if (updateResumeInstallRef.current) {
        const permissionState = await refreshInstallPermissionState();
        if (permissionState === 'granted' && updateState.downloadedApk) {
          updateResumeInstallRef.current = false;
          await installDownloadedUpdate(updateState.downloadedApk);
          return;
        }
      }

      if (Date.now() - lastUpdateCheckAtRef.current > UPDATE_CHECK_INTERVAL_MS) {
        await checkForUpdates({ quiet: true, force: true });
      }
    };

    const listener = CapApp.addListener('appStateChange', handleAppState);
    return () => {
      listener.then((handle) => handle.remove());
    };
  }, [checkForUpdates, installDownloadedUpdate, refreshInstallPermissionState, updateState.downloadedApk]);

  const closeSettingsSurface = useCallback(() => {
    const shouldReturnToSidebar = settingsReturnToSidebarRef.current;
    settingsReturnToSidebarRef.current = false;
    setShowSettings(false);
    if (shouldReturnToSidebar) {
      setIsLocked(false);
    }
  }, []);

  const stopTelegramLoginPolling = useCallback(() => {
    telegramLoginPollRunRef.current += 1;
    telegramLoginPollAbortRef.current?.abort();
    telegramLoginPollAbortRef.current = null;
  }, []);

  const closeTelegramAuthSurface = useCallback(() => {
    stopTelegramLoginPolling();
    const shouldReturnToSidebar = telegramAuthReturnToSidebarRef.current;
    telegramAuthReturnToSidebarRef.current = false;
    telegramPendingRouteRef.current = null;
    setTgLoginId(null);
    setTgAuthPendingStage('idle');
    setTgCode('');
    setTgPassword('');
    setTgError(null);
    setTgStatus(tgPhoneDigits ? 'phoneInput' : 'loggedOut');
    setShowTelegramAuthModal(false);
    if (shouldReturnToSidebar) {
      setIsLocked(false);
    }
  }, [stopTelegramLoginPolling, tgPhoneDigits]);

  const openSettingsPanel = useCallback((panel: SettingsPanel, options: { returnToSidebar?: boolean } = {}) => {
    if (panel === 'telegram') {
      telegramContextKeyRef.current = '';
    }
    telegramPendingRouteRef.current = null;
    telegramAuthReturnToSidebarRef.current = false;
    setShowTelegramAuthModal(false);
    setSettingsPanel(panel);
    setShowCinemaScreen(false);
    setShowSettings(true);
    settingsReturnToSidebarRef.current = Boolean(options.returnToSidebar);
    setIsLocked(true);
  }, []);

  const openTelegramAuthWizard = useCallback((
    route: Extract<MenuRoute, { target: 'telegram' }> | null,
    options: { returnToSidebar?: boolean } = {}
  ) => {
    telegramPendingRouteRef.current = route;
    telegramAuthReturnToSidebarRef.current = Boolean(options.returnToSidebar);
    settingsReturnToSidebarRef.current = false;
    searchReturnToSidebarRef.current = false;
    stopTelegramLoginPolling();
    setShowCinemaScreen(false);
    setShowSearch(false);
    setShowSettings(false);
    setNavContext(null);
    setPosterContextMovie(null);
    setShowTelegramAuthModal(true);
    setIsLocked(true);
    setTgCode('');
    setTgPassword('');
    setTgAuthPendingStage('idle');
    setTgError(null);
    setTgStatus((current) => {
      if (current === 'codeInput' || current === 'passwordInput') {
        return current;
      }
      return 'phoneInput';
    });
  }, [stopTelegramLoginPolling]);

  const applyMenuRoute = useCallback((route: MenuRoute) => {
    stopTelegramLoginPolling();
    setNavContext(null);
    setShowSearch(false);
    setShowSettings(false);
    setShowTelegramAuthModal(false);
    setShowCinemaScreen(false);
    setPosterContextMovie(null);
    searchReturnToSidebarRef.current = false;
    settingsReturnToSidebarRef.current = false;

    if (route.target === 'favorites') {
      setLibrarySection('favorites');
      setIsLocked(true);
      return;
    }

    if (route.target === 'history') {
      setLibrarySection('history');
      setIsLocked(true);
      return;
    }

    if (route.target === 'continue_watching') {
      setLibrarySection('continue_watching');
      setIsLocked(true);
      return;
    }

    const nextRouteState = resolveRootRouteState(route);
    if (!nextRouteState) {
      return;
    }

    setLibrarySection(nextRouteState.librarySection);
    if (nextRouteState.movieCategory) setMovieCategory(nextRouteState.movieCategory);
    if (nextRouteState.seriesCategory) setSeriesCategory(nextRouteState.seriesCategory);
    if (nextRouteState.israeliCategory) setIsraeliCategory(nextRouteState.israeliCategory);
    if (nextRouteState.telegramCategory) setTelegramCategory(nextRouteState.telegramCategory);
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

  const updateMediaProgressEntry = useCallback((item: CorridorItem, progressSeconds: number, durationSeconds: number) => {
    const mediaKey = buildMediaKey(item);
    if (!mediaKey) return;

    setMediaStateMap((prev) => ({
      ...prev,
      [mediaKey]: updateProgressState(item, prev[mediaKey], progressSeconds, durationSeconds)
    }));
  }, []);

  const clearPreparedNextPlayback = useCallback(async (options: { preserveDismissed?: boolean } = {}) => {
    preparedNextNavContextRef.current = null;
    if (!options.preserveDismissed) {
      autoplayDismissedRef.current = false;
    }
    preparedNextPlaybackRef.current = null;
    nextEpisodePreparePromiseRef.current = null;
    setPreparedNextPlayback(null);
    await NativePlayer.updateAutoplayOverlay({ visible: false }).catch(() => null);
  }, []);

  const closePlayer = useCallback(async (options: { preserveQueuedNext?: boolean } = {}) => {
    if (!options.preserveQueuedNext) {
      await clearPreparedNextPlayback();
    } else {
      await NativePlayer.updateAutoplayOverlay({ visible: false }).catch(() => null);
    }

    await NativePlayer.close().catch(() => null);
    setActiveMedia(null);
  }, [clearPreparedNextPlayback]);

  const refreshTelegramStatus = useCallback(async (options: { quiet?: boolean } = {}) => {
    const requestId = ++telegramStatusRequestRef.current;
    const hasActiveLogin = Boolean(tgLoginId);
    if (!options.quiet) {
      setTgBusy(true);
    }

    try {
      const data = await fetchApiJson<{ loggedIn?: boolean; configured?: boolean }>(
        buildApiUrl(normalizedApiBase, '/api/tg/status')
      );

      if (requestId !== telegramStatusRequestRef.current) return;

      setTgConfigured(data.configured !== false);
      setTgStatus((current) => resolveTelegramStatusAfterRefresh({
        currentStatus: current,
        hasActiveLogin,
        remoteLoggedIn: Boolean(data.loggedIn),
        pendingStage: tgAuthPendingStage
      }));
      if (!data.loggedIn && !hasActiveLogin) {
        setTgLoginId(null);
        setTgSources([]);
        setTgSubtitleResults([]);
        setTgSelectedSubtitleUrl(null);
        setTelegramItems([]);
      }
    } catch (error: any) {
      if (requestId !== telegramStatusRequestRef.current) return;
      console.error('Telegram status failed', error);
      const rawMessage = error?.message || 'Failed to check Telegram status';
      const message = translateTelegramAuthError(rawMessage);
      setTgError(message);
      setTgConfigured(!String(rawMessage).toLowerCase().includes('not configured'));
      setTgStatus((current) => resolveTelegramStatusAfterRefresh({
        currentStatus: current,
        hasActiveLogin,
        remoteLoggedIn: false,
        pendingStage: tgAuthPendingStage
      }));
    } finally {
      if (requestId === telegramStatusRequestRef.current && !options.quiet) {
        setTgBusy(false);
      }
    }
  }, [normalizedApiBase, tgAuthPendingStage, tgLoginId]);

  const resetTelegramSearchState = useCallback((options: { preserveQuery?: boolean } = {}) => {
    if (!options.preserveQuery) {
      setTgSearchQuery('');
    }
    setTgSources([]);
    setTgSubtitleResults([]);
    setTgSelectedSubtitleUrl(null);
  }, []);

  const applyTelegramSession = useCallback((sessionString: string | null) => {
    if (sessionString) {
      safeSetString(localStorage, PERSISTED_STORAGE_KEYS.telegramSession, sessionString);
    } else {
      safeRemove(localStorage, PERSISTED_STORAGE_KEYS.telegramSession);
    }
  }, []);

  const handleTelegramPhoneDigitsChange = useCallback((value: string) => {
    stopTelegramLoginPolling();
    setTgPhoneDigits(normalizeIsraeliPhoneDigits(value));
    setTgLoginId(null);
    setTgCode('');
    setTgPassword('');
    setTgAuthPendingStage('idle');
    setTgStatus((current) => (current === 'loggedOut' ? 'phoneInput' : current));
    setTgError(null);
  }, [stopTelegramLoginPolling]);

  const pollTelegramLoginStatus = useCallback((loginId: string) => {
    stopTelegramLoginPolling();
    const runId = telegramLoginPollRunRef.current + 1;
    telegramLoginPollRunRef.current = runId;
    const controller = new AbortController();
    telegramLoginPollAbortRef.current = controller;
    const startedAt = Date.now();

    void (async () => {
      while (!controller.signal.aborted && telegramLoginPollRunRef.current === runId) {
        if (Date.now() - startedAt > 30000) {
          setTgAuthPendingStage('idle');
          setTgBusy(false);
          setTgError('שליחת הקוד לוקחת יותר מדי זמן. נסה שוב.');
          return;
        }

        try {
          const data = await fetchApiJson<{
            success?: boolean;
            stage?: TelegramLoginServerStage;
            phone?: string;
            error?: string;
            configured?: boolean;
            sessionString?: string;
          }>(
            buildApiUrl(normalizedApiBase, `/api/tg/login-status?loginId=${encodeURIComponent(loginId)}`),
            { signal: controller.signal },
            { timeoutMs: 10000, retryCount: 0 }
          );

          if (controller.signal.aborted || telegramLoginPollRunRef.current !== runId) {
            return;
          }

          if (data.configured === false) {
            setTgConfigured(false);
          }

          if (data.error) {
            setTgAuthPendingStage('idle');
            setTgBusy(false);
            setTgError(translateTelegramAuthError(data.error));
            return;
          }

          const nextStage = data.stage ?? 'starting';
          if (nextStage === 'starting') {
            setTgAuthPendingStage('starting');
          } else if (nextStage === 'codeInput') {
            setTgStatus('codeInput');
            setTgAuthPendingStage('awaiting_code');
            setTgBusy(false);
            setTgError(null);
            return;
          } else if (nextStage === 'passwordInput') {
            setTgStatus('passwordInput');
            setTgAuthPendingStage('awaiting_password');
            setTgBusy(false);
            setTgError(null);
            return;
          } else if (nextStage === 'loggedIn' && data.sessionString) {
            applyTelegramSession(data.sessionString);
            setTgLoginId(null);
            setTgCode('');
            setTgPassword('');
            setTgStatus('loggedIn');
            setTgAuthPendingStage('idle');
            setTgBusy(false);
            setTgError(null);
            await finalizeTelegramLogin();
            return;
          }
        } catch (error: any) {
          if (controller.signal.aborted || telegramLoginPollRunRef.current !== runId) {
            return;
          }

          if (error?.name === 'AbortError') {
            return;
          }

          setTgAuthPendingStage('idle');
          setTgBusy(false);
          setTgError(translateTelegramAuthError(error?.message || 'שליחת הקוד לוקחת יותר מדי זמן. נסה שוב.'));
          return;
        }

        await new Promise((resolve) => setTimeout(resolve, 800));
      }
    })();
  }, [applyTelegramSession, normalizedApiBase, stopTelegramLoginPolling]);

  const finalizeTelegramLogin = useCallback(async () => {
    stopTelegramLoginPolling();
    setTgAuthPendingStage('idle');
    await refreshTelegramStatus({ quiet: true });
    setShowTelegramAuthModal(false);

    const pendingRoute = telegramPendingRouteRef.current;
    const shouldReturnToSidebar = telegramAuthReturnToSidebarRef.current;
    telegramPendingRouteRef.current = null;
    telegramAuthReturnToSidebarRef.current = false;

    if (pendingRoute) {
      applyMenuRoute(pendingRoute);
      return;
    }

    if (shouldReturnToSidebar) {
      setIsLocked(false);
    }
  }, [applyMenuRoute, refreshTelegramStatus, stopTelegramLoginPolling]);

  const startTelegramLogin = useCallback(async () => {
    if (!canStartTelegramLogin || !tgPhoneE164) {
      setTgError('הזן מספר טלפון ישראלי תקין כדי לקבל קוד אימות.');
      return;
    }
    const loginUrl = buildApiUrl(normalizedApiBase, '/api/tg/startLogin');
    if (import.meta.env.DEV) {
      console.log('LOGIN URL =', loginUrl);
    }

    stopTelegramLoginPolling();
    setTgBusy(true);
    setTgError(null);
    setTgAuthPendingStage('starting');
    try {
      const data = await fetchApiJson<{ loginId?: string; success?: boolean; stage?: TelegramLoginServerStage; phone?: string; sessionString?: string }>(
        loginUrl,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: tgPhoneE164 })
        },
        { timeoutMs: 25000, retryCount: 0 }
      );

      if (!data.loginId) {
        throw new Error('Telegram login did not return a login id.');
      }

      setTgLoginId(data.loginId);
      setTgCode('');
      setTgPassword('');
      const nextStage = data.stage ?? 'starting';
      setTgStatus(mapTelegramServerStageToStatus(nextStage));
      setTgAuthPendingStage(mapTelegramServerStageToPendingStage(nextStage));

      if (nextStage === 'loggedIn' && data.sessionString) {
        applyTelegramSession(data.sessionString);
        setTgLoginId(null);
        setTgStatus('loggedIn');
        await finalizeTelegramLogin();
        return;
      }

      if (nextStage === 'starting') {
        pollTelegramLoginStatus(data.loginId);
        return;
      }
    } catch (error: any) {
      console.error('Telegram login start failed', error);
      setTgAuthPendingStage('idle');
      setTgError(translateTelegramAuthError(error?.message || 'Failed to start Telegram login'));
    } finally {
      if (telegramLoginPollAbortRef.current == null) {
        setTgBusy(false);
      }
    }
  }, [applyTelegramSession, canStartTelegramLogin, finalizeTelegramLogin, normalizedApiBase, pollTelegramLoginStatus, stopTelegramLoginPolling, tgPhoneE164]);

  const submitTelegramCode = useCallback(async () => {
    if (!tgLoginId || !tgCode.trim()) {
      setTgError('הזן קודם את קוד האימות שנשלח אליך ב-Telegram.');
      return;
    }

    setTgBusy(true);
    setTgError(null);
    try {
      const data = await fetchApiJson<{ success?: boolean; requiresPassword?: boolean; stage?: TelegramAuthStatus; sessionString?: string }>(
        buildApiUrl(normalizedApiBase, '/api/tg/submitCode'),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ loginId: tgLoginId, code: tgCode.trim() })
        },
        { timeoutMs: 25000, retryCount: 0 }
      );

      if (data.requiresPassword) {
        setTgStatus('passwordInput');
        setTgAuthPendingStage('awaiting_password');
        return;
      }

      if (!data.sessionString) {
        throw new Error('Telegram did not return a session after code verification.');
      }

      applyTelegramSession(data.sessionString);
      setTgLoginId(null);
      setTgCode('');
      setTgPassword('');
      setTgStatus('loggedIn');
      setTgAuthPendingStage('idle');
      await finalizeTelegramLogin();
    } catch (error: any) {
      console.error('Telegram code verification failed', error);
      setTgAuthPendingStage('awaiting_code');
      setTgError(translateTelegramAuthError(error?.message || 'Failed to verify the Telegram code'));
    } finally {
      setTgBusy(false);
    }
  }, [applyTelegramSession, finalizeTelegramLogin, normalizedApiBase, tgCode, tgLoginId]);

  const submitTelegramPassword = useCallback(async () => {
    if (!tgLoginId || !tgPassword.trim()) {
      setTgError('הזן את סיסמת האבטחה של Telegram כדי להשלים את ההתחברות.');
      return;
    }

    setTgBusy(true);
    setTgError(null);
    try {
      const data = await fetchApiJson<{ success?: boolean; stage?: TelegramAuthStatus; sessionString?: string }>(
        buildApiUrl(normalizedApiBase, '/api/tg/submitPassword'),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ loginId: tgLoginId, password: tgPassword })
        },
        { timeoutMs: 25000, retryCount: 0 }
      );

      if (!data.sessionString) {
        throw new Error('Telegram did not return a session after password verification.');
      }

      applyTelegramSession(data.sessionString);
      setTgLoginId(null);
      setTgCode('');
      setTgPassword('');
      setTgStatus('loggedIn');
      setTgAuthPendingStage('idle');
      await finalizeTelegramLogin();
    } catch (error: any) {
      console.error('Telegram password verification failed', error);
      setTgAuthPendingStage('awaiting_password');
      setTgError(translateTelegramAuthError(error?.message || 'Failed to verify the Telegram password'));
    } finally {
      setTgBusy(false);
    }
  }, [applyTelegramSession, finalizeTelegramLogin, normalizedApiBase, tgLoginId, tgPassword]);

  const logoutTelegram = useCallback(async () => {
    stopTelegramLoginPolling();
    setTgBusy(true);
    setTgError(null);
    try {
      await fetchApiJson(buildApiUrl(normalizedApiBase, '/api/tg/logout'), { method: 'POST' });
    } catch (error) {
      console.warn('Telegram logout reported an error, clearing local session anyway.', error);
    } finally {
      applyTelegramSession(null);
      setTgLoginId(null);
      setTgCode('');
      setTgPassword('');
      setTgAuthPendingStage('idle');
      setTelegramItems([]);
      resetTelegramSearchState();
      setTgStatus(tgPhoneDigits ? 'phoneInput' : 'loggedOut');
      telegramPendingRouteRef.current = null;
      telegramAuthReturnToSidebarRef.current = false;
      setShowTelegramAuthModal(false);
      setTgBusy(false);
    }
  }, [applyTelegramSession, normalizedApiBase, resetTelegramSearchState, stopTelegramLoginPolling, tgPhoneDigits]);

  const searchTelegramSubtitlesForItem = useCallback(async (
    item: CorridorItem,
    options: { query?: string; quiet?: boolean } = {}
  ) => {
    if (!isPlayableMediaItem(item) || tgStatus !== 'loggedIn') return [];

    const query = (options.query ?? buildSubtitleSearchQuery(item)).trim();
    if (!query) return [];

    if (!options.quiet) {
      setIsSearchingTelegramSubtitles(true);
    }

    try {
      const data = await fetchApiJson<{ results?: TelegramSubtitleResult[] }>(
        buildApiUrl(normalizedApiBase, `/api/tg/search-subtitles?query=${encodeURIComponent(query)}`)
      );

      const results = Array.isArray(data.results) ? data.results : [];
      setTgSubtitleResults(results);
      setTgSelectedSubtitleUrl((current) => {
        if (current && results.some((subtitle) => subtitle.subtitleUrl === current)) {
          return current;
        }
        return pickDefaultSubtitle(results) ?? null;
      });
      return results;
    } catch (error: any) {
      console.error('Subtitle search failed', error);
      setTgError(error?.message || 'Failed to search Telegram subtitles');
      return [];
    } finally {
      if (!options.quiet) {
        setIsSearchingTelegramSubtitles(false);
      }
    }
  }, [normalizedApiBase, tgStatus]);

  const searchTelegramSourcesForItem = useCallback(async (
    item: CorridorItem,
    options: { query?: string; includeSubtitles?: boolean } = {}
  ) => {
    if (!isPlayableMediaItem(item)) {
      setTgError('Choose a movie or an episode before searching Telegram sources.');
      return [];
    }

    if (tgStatus !== 'loggedIn') {
      setTgError('Connect Telegram first to search for sources.');
      return [];
    }

    const query = (options.query ?? buildTelegramSearchQuery(item)).trim();
    if (!query) {
      setTgError('The Telegram query is empty.');
      return [];
    }

    setIsSearchingTelegramSources(true);
    setTgError(null);

    try {
      const data = await fetchApiJson<{ results?: TelegramSearchResult[] }>(
        buildApiUrl(normalizedApiBase, `/api/tg/search?query=${encodeURIComponent(query)}`)
      );

      const results = Array.isArray(data.results) ? data.results : [];
      setTgSearchQuery(query);
      setTgSources(results);

      if (options.includeSubtitles) {
        void searchTelegramSubtitlesForItem(item, { quiet: true });
      }

      return results;
    } catch (error: any) {
      console.error('Telegram source search failed', error);
      setTgError(error?.message || 'Failed to search Telegram sources');
      return [];
    } finally {
      setIsSearchingTelegramSources(false);
    }
  }, [normalizedApiBase, searchTelegramSubtitlesForItem, tgStatus]);

  const openPreparedPlayback = useCallback(async (
    prepared: PreparedPlayback,
    options: { nextNavContext?: NavContext | null } = {}
  ) => {
    const cacheEntry = playbackCacheMapRef.current[prepared.sourceKey];
    const resolvedUrl = isPlayableFromCache(cacheEntry) && cacheEntry.cacheUri ? cacheEntry.cacheUri : prepared.streamUrl;
    const nextActiveMedia: ActivePlayback = {
      ...prepared,
      cacheUri: cacheEntry?.cacheUri ?? prepared.cacheUri,
      url: resolvedUrl
    };

    await NativePlayer.updateAutoplayOverlay({ visible: false }).catch(() => null);
    await NativePlayer.close().catch(() => null);

    if (options.nextNavContext) {
      setNavContext(options.nextNavContext);
    }

    autoplayDismissedRef.current = false;
    preparedNextNavContextRef.current = null;
    setPreparedNextPlayback(null);
    preparedNextPlaybackRef.current = null;
    nextEpisodePreparePromiseRef.current = null;

    setShowSettings(false);
    settingsReturnToSidebarRef.current = false;
    setShowCinemaScreen(false);
    setPosterContextMovie(null);
    setSelectedMovie(prepared.mediaItem);
    setIsLocked(true);
    setActiveMedia(nextActiveMedia);

    setPlaybackCacheMap((prev) => upsertPlaybackCacheEntry(prev, prepared.sourceKey, {
      sourceKey: prepared.sourceKey,
      mediaKey: buildMediaKey(prepared.mediaItem),
      title: prepared.title,
      mediaType: prepared.mediaItem.mediaType,
      peerId: prepared.peerId,
      messageId: prepared.messageId,
      streamUrl: prepared.streamUrl,
      downloadUrl: prepared.downloadUrl,
      cachePath: prepared.cachePath,
      cacheUri: cacheEntry?.cacheUri ?? prepared.cacheUri,
      fileName: prepared.fileName,
      mimeType: prepared.mimeType,
      fileSizeBytes: prepared.fileSizeBytes,
      durationSeconds: prepared.durationSeconds,
      lastPositionSeconds: prepared.resumePositionSeconds
    }));

    try {
      await NativePlayer.open({
        url: resolvedUrl,
        title: prepared.title,
        sourceKey: prepared.sourceKey,
        subtitleUrl: prepared.subtitleUrl,
        startPositionMs: Math.round(prepared.resumePositionSeconds * 1000)
      });
    } catch (error) {
      setActiveMedia(null);
      throw error;
    }
  }, []);

  const resolvePreparedPlayback = useCallback(async (
    mediaItem: CorridorItem,
    source: TelegramSearchResult,
    options: { allowSubtitleLookup?: boolean } = {}
  ) => {
    const [sourceInfo, subtitleResults] = await Promise.all([
      fetchApiJson<TelegramSourceInfo>(
        buildApiUrl(normalizedApiBase, `/api/tg/source/${encodeURIComponent(source.peerId)}/${source.id}`)
      ),
      tgSelectedSubtitleUrl || options.allowSubtitleLookup === false
        ? Promise.resolve<TelegramSubtitleResult[]>([])
        : searchTelegramSubtitlesForItem(mediaItem, { quiet: true })
    ]);

    const subtitleUrl = tgSelectedSubtitleUrl
      || pickDefaultSubtitle(subtitleResults)
      || undefined;

    if (!sourceInfo.streamUrl) {
      throw new Error('Telegram source is missing a stream URL.');
    }

    return buildPreparedPlayback({
      apiBase: normalizedApiBase,
      mediaItem,
      source,
      sourceInfo,
      subtitleUrl,
      resumePositionSeconds: getResumePositionSeconds(mediaItem, mediaStateMapRef.current)
    });
  }, [normalizedApiBase, searchTelegramSubtitlesForItem, tgSelectedSubtitleUrl]);

  const playTelegramSource = useCallback(async (
    source: TelegramSearchResult,
    options: { mediaItem?: CorridorItem; nextNavContext?: NavContext | null; queueOnly?: boolean; allowSubtitleLookup?: boolean } = {}
  ) => {
    const mediaItem = options.mediaItem ?? (selectedMovie && isPlayableMediaItem(selectedMovie) ? selectedMovie : null);
    if (!mediaItem) {
      setTgError('Choose a movie or an episode before playing a Telegram source.');
      return null;
    }

    setPreparingTelegramSourceId(source.id);
    setTgError(null);
    try {
      const prepared = await resolvePreparedPlayback(mediaItem, source, {
        allowSubtitleLookup: options.allowSubtitleLookup
      });
      if (options.queueOnly) {
        preparedNextPlaybackRef.current = prepared;
        preparedNextNavContextRef.current = options.nextNavContext ?? null;
        autoplayDismissedRef.current = false;
        setPreparedNextPlayback(prepared);
        await NativePlayer.updateAutoplayOverlay({
          visible: true,
          title: prepared.title,
          remainingSeconds: AUTOPLAY_PRELOAD_SECONDS
        }).catch(() => null);
        return prepared;
      }

      await openPreparedPlayback(prepared, { nextNavContext: options.nextNavContext });
      return prepared;
    } catch (error: any) {
      console.error('Preparing Telegram playback failed', error);
      setTgError(error?.message || 'Failed to prepare Telegram playback');
      return null;
    } finally {
      setPreparingTelegramSourceId(null);
    }
  }, [openPreparedPlayback, resolvePreparedPlayback, selectedMovie]);

  const fetchSeriesSeasons = useCallback(async (seriesItem: CorridorItem, signal?: AbortSignal) => {
    const seriesId = Number(seriesItem.seriesId ?? seriesItem.id);
    if (!Number.isFinite(seriesId)) {
      throw new Error('Series is missing an id');
    }

    const data = await fetchApiJson<any>(buildApiUrl(normalizedApiBase, `/api/series/${seriesId}`), { signal });
    const seriesTitle = String(data?.seriesTitle || seriesItem.seriesTitle || seriesItem.localizedTitle || seriesItem.title);
    const seasons = normalizeSeasonPage(data?.seasons, { seriesId, seriesTitle });

    return buildSeasonsNavContext(seriesItem, seasons, seriesTitle);
  }, [normalizedApiBase]);

  const fetchSeasonEpisodes = useCallback(async (seasonItem: CorridorItem, parentContext: NavContext, signal?: AbortSignal) => {
    const inheritedParent = parentContext?.type === 'episodes' ? parentContext.parent : parentContext;
    const seriesId = Number(seasonItem.seriesId ?? inheritedParent?.seriesId ?? seasonItem.id);
    const seasonNum = Number(seasonItem.seasonNum ?? seasonItem.season_number);
    if (!Number.isFinite(seriesId) || !Number.isFinite(seasonNum)) {
      throw new Error('Season is missing identity');
    }

    const parent = inheritedParent && inheritedParent.type === 'seasons'
      ? inheritedParent
      : buildSeasonsNavContext(
          {
            ...seasonItem,
            id: seriesId,
            title: seasonItem.seriesTitle || 'Series',
            localizedTitle: seasonItem.seriesTitle || seasonItem.localizedTitle || seasonItem.title,
            originalTitle: seasonItem.seriesTitle || seasonItem.originalTitle || seasonItem.title,
            mediaType: 'tv'
          },
          [],
          seasonItem.seriesTitle || 'Series'
        );

    const data = await fetchApiJson<any>(buildApiUrl(normalizedApiBase, `/api/series/${seriesId}/season/${seasonNum}`), { signal });
    const seasonTitle = String(data?.seasonTitle || seasonItem.seasonTitle || seasonItem.localizedTitle || seasonItem.title);
    const episodes = normalizeEpisodePage(data?.episodes, {
      seriesId,
      seriesTitle: parent.seriesTitle,
      seasonNum,
      seasonTitle
    });

    return buildEpisodesNavContext(seasonItem, episodes, parent, seasonTitle);
  }, [normalizedApiBase]);

  const resolveNextEpisodeCandidate = useCallback(async (currentItem: CorridorItem) => {
    if (currentItem.mediaType !== 'episode' || navContext?.type !== 'episodes') {
      return null;
    }

    const currentSeasonNumber = Number(currentItem.seasonNum ?? currentItem.season_number ?? 0);
    if (
      Number(navContext.seriesId) !== Number(currentItem.seriesId ?? 0)
      || Number(navContext.seasonNum) !== currentSeasonNumber
    ) {
      return null;
    }

    const nextEpisode = findNextEpisodeInSeason(currentItem, navContext.episodes);
    if (nextEpisode) {
      return { item: nextEpisode, nextNavContext: null as NavContext };
    }

    const nextSeason = findNextSeason(navContext.seasonNum, navContext.parent.seasons);
    if (!nextSeason) {
      return null;
    }

    const nextContext = await fetchSeasonEpisodes(nextSeason, navContext.parent);
    const firstEpisode = nextContext.episodes[0];
    if (!firstEpisode) {
      return null;
    }

    return { item: firstEpisode, nextNavContext: nextContext as NavContext };
  }, [fetchSeasonEpisodes, navContext]);

  const prepareNextEpisodePlayback = useCallback(async (
    playback: ActivePlayback,
    progressSeconds: number,
    durationSeconds: number
  ) => {
    if (autoplayDismissedRef.current) {
      return;
    }

    if (!shouldPrepareNextEpisode(
      progressSeconds,
      durationSeconds,
      Boolean(preparedNextPlaybackRef.current || nextEpisodePreparePromiseRef.current),
      autoPlayNextEpisode
    )) {
      if (preparedNextPlaybackRef.current && !autoplayDismissedRef.current) {
        const remainingSeconds = Math.max(0, Math.ceil(durationSeconds - progressSeconds));
        await NativePlayer.updateAutoplayOverlay({
          visible: true,
          title: preparedNextPlaybackRef.current.title,
          remainingSeconds
        }).catch(() => null);
      }
      return;
    }

    if (playback.mediaItem.mediaType !== 'episode' || nextEpisodePreparePromiseRef.current) {
      return;
    }

    const candidateTask = (async () => {
      try {
        const candidate = await resolveNextEpisodeCandidate(playback.mediaItem);
        if (!candidate?.item) return;

        const data = await fetchApiJson<{ results?: TelegramSearchResult[] }>(
          buildApiUrl(
            normalizedApiBase,
            `/api/tg/search?query=${encodeURIComponent(buildTelegramSearchQuery(candidate.item))}`
          )
        );
        const searchResults = Array.isArray(data.results) ? data.results : [];
        const source = searchResults[0];
        if (!source) return;

        await playTelegramSource(source, {
          mediaItem: candidate.item,
          nextNavContext: candidate.nextNavContext,
          queueOnly: true,
          allowSubtitleLookup: false
        });
      } catch (error) {
        console.error('Next episode preparation failed', error);
      } finally {
        nextEpisodePreparePromiseRef.current = null;
      }
    })();

    nextEpisodePreparePromiseRef.current = candidateTask;
    await candidateTask;
  }, [autoPlayNextEpisode, normalizedApiBase, playTelegramSource, resolveNextEpisodeCandidate]);

  useEffect(() => {
    void refreshTelegramStatus();
  }, [refreshTelegramStatus]);

  useEffect(() => () => {
    stopTelegramLoginPolling();
  }, [stopTelegramLoginPolling]);

  useEffect(() => {
    if (!showSettings || settingsPanel !== 'telegram') return;

    const playableItem = selectedMovie && isPlayableMediaItem(selectedMovie) ? selectedMovie : null;
    const contextKey = playableItem ? buildMediaKey(playableItem) : '';

    if (telegramContextKeyRef.current === contextKey) return;
    telegramContextKeyRef.current = contextKey;

    resetTelegramSearchState({ preserveQuery: false });
    setTgError(null);

    if (!playableItem) return;

    const nextQuery = buildTelegramSearchQuery(playableItem);
    setTgSearchQuery(nextQuery);

    if (tgStatus === 'loggedIn') {
      void searchTelegramSourcesForItem(playableItem, {
        query: nextQuery,
        includeSubtitles: true
      });
    }
  }, [resetTelegramSearchState, searchTelegramSourcesForItem, selectedMovie, settingsPanel, showSettings, tgStatus]);

  useEffect(() => {
    if (settingsPanel !== 'telegram' || !showSettings || tgStatus !== 'loggedIn') return;
    if (tgSources.length > 0 || isSearchingTelegramSources) return;

    const playableItem = selectedMovie && isPlayableMediaItem(selectedMovie) ? selectedMovie : null;
    if (!playableItem) return;

    const nextQuery = tgSearchQuery.trim() || buildTelegramSearchQuery(playableItem);
    if (!nextQuery) return;

    void searchTelegramSourcesForItem(playableItem, {
      query: nextQuery,
      includeSubtitles: tgSubtitleResults.length === 0
    });
  }, [isSearchingTelegramSources, searchTelegramSourcesForItem, selectedMovie, settingsPanel, showSettings, tgSearchQuery, tgSources.length, tgStatus, tgSubtitleResults.length]);

  useEffect(() => {
    let cancelled = false;
    const handles: Array<{ remove: () => Promise<void> }> = [];

    const bindListeners = async () => {
      try {
        const progressHandle = await NativePlayer.addListener('progress', async (event: NativePlayerProgressEvent) => {
          if (cancelled) return;
          const playback = activeMediaRef.current;
          if (!playback) return;

          const positionSeconds = Math.max(0, Math.round((event.positionMs || 0) / 1000));
          const durationSeconds = Math.max(
            playback.durationSeconds || 0,
            Math.round((event.durationMs || 0) / 1000)
          );

          updateMediaProgressEntry(playback.mediaItem, positionSeconds, durationSeconds);
          setPlaybackCacheMap((prev) => upsertPlaybackCacheEntry(prev, playback.sourceKey, {
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
            durationSeconds,
            lastPositionSeconds: positionSeconds
          }));

          void prepareNextEpisodePlayback(playback, positionSeconds, durationSeconds);
        });

        const endedHandle = await NativePlayer.addListener('ended', async () => {
          if (cancelled) return;
          const playback = activeMediaRef.current;
          if (!playback) return;

          const durationSeconds = playback.durationSeconds || mediaStateMapRef.current[buildMediaKey(playback.mediaItem)]?.durationSeconds || 0;
          updateMediaProgressEntry(playback.mediaItem, durationSeconds, durationSeconds);

          if (preparedNextPlaybackRef.current && !autoplayDismissedRef.current) {
            const nextPlayback = preparedNextPlaybackRef.current;
            const nextNavContext = preparedNextNavContextRef.current;
            preparedNextPlaybackRef.current = null;
            preparedNextNavContextRef.current = null;
            autoplayDismissedRef.current = false;
            setPreparedNextPlayback(null);
            await openPreparedPlayback(nextPlayback, { nextNavContext });
            return;
          }

          const cacheEntry = playbackCacheMapRef.current[playback.sourceKey];
          if (cacheEntry?.isComplete) {
            setPlaybackCacheMap((prev) => removePlaybackCacheEntry(prev, playback.sourceKey));
          }
          await closePlayer();
        });

        const backHandle = await NativePlayer.addListener('backRequest', () => {
          void closePlayer();
        });

        const autoplayDismissedHandle = await NativePlayer.addListener('autoplayDismissed', () => {
          autoplayDismissedRef.current = true;
          void clearPreparedNextPlayback({ preserveDismissed: true });
        });

        const errorHandle = await NativePlayer.addListener('error', (event: NativePlayerErrorEvent) => {
          console.error('Native player error', event);
          setTgError(event.message || 'Native player error');
          void closePlayer();
        });

        handles.push(progressHandle, endedHandle, backHandle, autoplayDismissedHandle, errorHandle);
      } catch (error) {
        console.warn('Native player listeners are unavailable in this runtime.', error);
      }
    };

    void bindListeners();

    return () => {
      cancelled = true;
      handles.forEach((handle) => {
        void handle.remove();
      });
    };
  }, [clearPreparedNextPlayback, closePlayer, openPreparedPlayback, prepareNextEpisodePlayback, updateMediaProgressEntry]);

  const openPosterDetails = useCallback((item: CorridorItem) => {
    setFetchError(null);
    setShowCinemaScreen(false);
    setSelectedMovie(item);
    setIsLocked(true);
  }, []);

  const handlePosterSelect = useCallback(async (item: CorridorItem) => {
    const selectionAction = getSeriesSelectionAction(item);
    if (selectionAction === 'openDetails') {
      openPosterDetails(item);
      return;
    }

    hierarchyFetchAbortRef.current?.abort();
    const controller = new AbortController();
    hierarchyFetchAbortRef.current = controller;
    const requestId = ++hierarchyRequestIdRef.current;

    setFetchError(null);
    setShowCinemaScreen(false);
    setSelectedMovie(null);
    setPosterContextMovie(null);
    setIsLoadingContent(true);
    setIsLocked(true);

    try {
      const nextContext = selectionAction === 'openSeasons'
        ? await fetchSeriesSeasons(item, controller.signal)
        : await fetchSeasonEpisodes(item, navContext, controller.signal);

      if (requestId !== hierarchyRequestIdRef.current) return;

      setNavContext(nextContext);
      setFocusedId(null);
      setFocusedHeartId(null);
    } catch (error: any) {
      if (error?.name === 'AbortError') return;
      console.error('Series hierarchy fetch failed', error);
      setFetchError(error?.message || 'Failed to open series corridor');
    } finally {
      if (requestId === hierarchyRequestIdRef.current) {
        setIsLoadingContent(false);
      }
      if (hierarchyFetchAbortRef.current === controller) {
        hierarchyFetchAbortRef.current = null;
      }
    }
  }, [fetchSeasonEpisodes, fetchSeriesSeasons, navContext, openPosterDetails]);

  // --- CONTENT LOADING ENGINE ---

  const contentFetchAbortRef = useRef<AbortController | null>(null);
  const loadMoreAbortRef = useRef<AbortController | null>(null);
  const hierarchyFetchAbortRef = useRef<AbortController | null>(null);
  const hierarchyRequestIdRef = useRef(0);
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
    if (target === 'telegram') {
      setTelegramItems(items);
      return;
    }
    setIsraeliItems(items);
  }, []);

  const getItemsForTarget = useCallback((target: FeedTarget) => {
    if (target === 'movies') return baseMovies;
    if (target === 'series') return seriesItems;
    if (target === 'telegram') return telegramItems;
    return israeliItems;
  }, [baseMovies, seriesItems, telegramItems, israeliItems]);

  const getCategorySeed = useCallback((category: string, page = 1) => (
    category === 'random' ? shuffleSeed + page : undefined
  ), [shuffleSeed]);

  const readCachedCategoryPage = useCallback((
    target: FeedTarget,
    category: string,
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
    if (!appVisible) return;
    const validItems = items.filter((item) => item?.poster);
    if (validItems.length === 0) return;

    const priorityLimit = Math.min(
      validItems.length,
      Math.max(priorityCount, Math.min(runtimePerformanceProfile.priorityPosterCount, corridorTierConfig.maxThumbPrefetch))
    );
    const secondaryLimit = runtimePerformanceProfile.allowSecondaryPosterPrefetch
      ? runtimePerformanceProfile.secondaryPosterCount
      : 0;
    const priorityItems = validItems.slice(0, priorityLimit);

    const priorityUrls = priorityItems.map((item) => item.posterThumb || item.poster);
    const secondaryUrls = secondaryLimit > 0
      ? validItems
          .slice(priorityLimit, priorityLimit + secondaryLimit)
          .map((item) => item.posterThumb || item.poster)
      : [];

    void textureManager.prefetchPriority(
      priorityUrls,
      secondaryUrls,
      runtimePerformanceProfile.texturePrefetchConcurrency
    );
  }, [appVisible, corridorTierConfig.maxThumbPrefetch, runtimePerformanceProfile]);

  const hydrateTargetFromLocalSources = useCallback((
    target: FeedTarget,
    category: string,
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
    category: string,
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
    if (target === 'telegram') {
      params.set('type', category);
    } else {
      params.set('category', category);
    }
    if (genreId) params.set('genre_id', String(genreId));
    if (year && year !== 'all') params.set('year', String(year).replace(/[^0-9]/g, '').slice(0, 4));
    if (seed) params.set('seed', String(seed));

    const endpoint = target === 'movies'
      ? '/api/movies'
      : target === 'series'
        ? '/api/series'
        : target === 'telegram'
          ? '/api/tg/dialogs'
          : '/api/israeli';
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
    category: string,
    options: { genreId?: number | null; year?: YearFilter; page: number; prefetchPosters?: boolean }
  ) => {
    const { genreId, year, page, prefetchPosters = runtimePerformanceProfile.prefetchPostersForNextPage } = options;
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
      await fetchCategoryContent(target, category, { genreId, year, page, prefetchPosters });
    } catch (error: any) {
      if (error?.name !== 'AbortError') {
        prefetchedPageKeysRef.current.delete(cacheKey);
      }
    }
  }, [fetchCategoryContent, getCategorySeed, posterBatchSize, runtimePerformanceProfile.prefetchPostersForNextPage]);

  const getCurrentRootContext = useCallback(() => {
    const target = getFeedTargetForSection(librarySection);
    if (target === 'movies') {
      return { target, category: movieCategory, genreId: movieGenreId, year: yearFilter };
    }
    if (target === 'series') {
      return { target, category: seriesCategory, genreId: null, year: yearFilter };
    }
    if (target === 'telegram') {
      return { target, category: telegramCategory, genreId: null, year: 'all' as YearFilter };
    }
    return { target, category: israeliCategory, genreId: null, year: yearFilter };
  }, [librarySection, movieCategory, movieGenreId, seriesCategory, telegramCategory, israeliCategory, yearFilter]);

  const getCurrentRootRequestKey = useCallback(() => {
    const { target, category, genreId, year } = getCurrentRootContext();
    const currentSeed = category === 'random' ? getCategorySeed(category) : undefined;
    return buildRootRequestKey({ target, category, genreId, year, seed: currentSeed });
  }, [getCategorySeed, getCurrentRootContext]);

  const loadContentForCurrentSection = useCallback(async () => {
    if (showSearch || navContext) return;
    if (librarySection === 'favorites' || librarySection === 'history' || librarySection === 'continue_watching') return;
    if (librarySection === 'telegram' && tgStatus !== 'loggedIn') {
      setTelegramItems([]);
      setHasMore(false);
      setIsLoadingContent(false);
      setFetchError(null);
      return;
    }

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
  }, [showSearch, navContext, librarySection, tgStatus, getCurrentRootContext, getCurrentRootRequestKey, getItemsForTarget, hydrateTargetFromLocalSources, fetchCategoryContent, setItemsForTarget, prefetchNextCategoryPage]);

  useEffect(() => {
    loadContentForCurrentSection();
    return () => {
      contentFetchAbortRef.current?.abort();
    };
  }, [loadContentForCurrentSection]);

  useEffect(() => {
    if (showSearch || navContext || isLoadingContent) return;
    if (!shouldRunBackgroundWarmup(runtimePerformanceProfile, appVisible)) return;
    const activeTarget = getFeedTargetForSection(librarySection);
    const targets = (['movies', 'series', 'israeli'] as FeedTarget[]).filter((target) => target !== activeTarget);
    const pendingTargets = targets
      .filter((target) => !backgroundWarmupTargetsRef.current.has(target))
      .slice(0, runtimePerformanceProfile.backgroundWarmupTargets);
    if (pendingTargets.length === 0) return;

    const timer = window.setTimeout(() => {
      pendingTargets.forEach((target) => backgroundWarmupTargetsRef.current.add(target));
      void Promise.allSettled(pendingTargets.map((target) =>
        fetchCategoryContent(target, 'popular', { page: 1, prefetchPosters: false }).catch((error) => {
          backgroundWarmupTargetsRef.current.delete(target);
          throw error;
        })
      ));
    }, runtimePerformanceProfile.backgroundWarmupDelayMs);

    return () => window.clearTimeout(timer);
  }, [appVisible, showSearch, navContext, isLoadingContent, librarySection, fetchCategoryContent, runtimePerformanceProfile]);

  useEffect(() => {
    loadMoreAbortRef.current?.abort();
    loadMoreAbortRef.current = null;
    hierarchyFetchAbortRef.current?.abort();
    hierarchyFetchAbortRef.current = null;
    hierarchyRequestIdRef.current += 1;
    activeLoadMorePageKeyRef.current = null;
    setCameraZ(CORRIDOR_INITIAL_CAMERA_Z);
    setContentPage(1);
    setHasMore(true);
    setIsLoadingMore(false);
    setNearEndGeneration((current) => current + 1);
    setFetchError(null);
    setFocusedId(null);
    setFocusedHeartId(null);
  }, [librarySection, movieCategory, seriesCategory, israeliCategory, telegramCategory, movieGenreId, seriesGenreFilter, yearFilter, shuffleSeed]);

  const loadMoreContent = useCallback(async () => {
    if (isLoadingMore || !hasMore || showSearch || navContext) return;
    if (librarySection === 'favorites' || librarySection === 'history' || librarySection === 'continue_watching') return;
    if (librarySection === 'telegram' && tgStatus !== 'loggedIn') return;

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
        } else if (target === 'telegram') {
          setTelegramItems((prev) => mergeCorridorItems(prev, result.items));
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
  }, [isLoadingMore, hasMore, showSearch, navContext, librarySection, tgStatus, contentPage, getCurrentRootContext, getCurrentRootRequestKey, fetchCategoryContent, prefetchNextCategoryPage]);

  const handleMenuSelection = useCallback((item: SideMenuItem) => {
    const selection = resolveMenuSelectionAction(item, { telegramConnected: tgStatus === 'loggedIn' });

    if (selection.type === 'open-search') {
      setNavContext(null);
      setShowTelegramAuthModal(false);
      setShowSettings(false);
      setShowCinemaScreen(false);
      setPosterContextMovie(null);
      // Search is a top-level surface. Back from it should return to the
      // root corridor, not reopen the sidebar behind it.
      searchReturnToSidebarRef.current = false;
      settingsReturnToSidebarRef.current = false;
      setShowSearch(true);
      setIsLocked(true);
      return;
    }

    if (selection.type === 'open-settings') {
      openSettingsPanel(selection.panel, { returnToSidebar: selection.returnToSidebar });
      return;
    }

    if (selection.type === 'open-telegram-auth' && item.kind === 'route' && item.route.target === 'telegram') {
      openTelegramAuthWizard(item.route, { returnToSidebar: selection.returnToSidebar });
      return;
    }

    if (selection.type === 'exit') {
      CapApp.exitApp();
      return;
    }

    if (item.kind === 'route') {
      applyMenuRoute(item.route);
    }
  }, [applyMenuRoute, openSettingsPanel, openTelegramAuthWizard, tgStatus]);

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

    const localMatches = rankSearchResults(searchPool, trimmedQuery);
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

      const remoteResults = normalizeCatalogPage(
        Array.isArray(data.results) ? data.results : [],
        'movie'
      );
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
  }, [searchPool, normalizedApiBase, abortPendingSearch]);

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

  const corridorScopeKey = useMemo(
    () => getCorridorScopeKey(currentRootRequestKey, navContext),
    [currentRootRequestKey, navContext]
  );

  const hierarchyMeta = useMemo(
    () => getHierarchyMeta(navContext),
    [navContext]
  );

  const telegramPlayableItem = useMemo(
    () => (selectedMovie && isPlayableMediaItem(selectedMovie) ? selectedMovie : null),
    [selectedMovie]
  );

  const selectedMoviePrimaryActionLabel = selectedMovie?.mediaType === 'tv'
    ? 'עונות'
    : selectedMovie?.mediaType === 'season'
      ? 'פרקים'
      : selectedMovie?.mediaType && isTelegramDialogMediaType(selectedMovie.mediaType)
        ? 'טלגרם'
      : 'צפייה';

  const handleSelectedMoviePrimaryAction = useCallback(() => {
    if (!selectedMovie) return;
    if (selectedMovie.mediaType && isTelegramDialogMediaType(selectedMovie.mediaType)) {
      openSettingsPanel('telegram');
      return;
    }
    const selectionAction = getSeriesSelectionAction(selectedMovie);
    if (selectionAction === 'openDetails') {
      setShowCinemaScreen(true);
      return;
    }
    void handlePosterSelect(selectedMovie);
  }, [handlePosterSelect, openSettingsPanel, selectedMovie]);

  const handleTelegramSourceSearch = useCallback(() => {
    if (!telegramPlayableItem) {
      setTgError('בחר סרט או פרק כדי לחפש מקורות בטלגרם.');
      return;
    }

    void searchTelegramSourcesForItem(telegramPlayableItem, {
      query: tgSearchQuery.trim() || buildTelegramSearchQuery(telegramPlayableItem),
      includeSubtitles: true
    });
  }, [searchTelegramSourcesForItem, telegramPlayableItem, tgSearchQuery]);

  const handleTelegramSubtitleSearch = useCallback(() => {
    if (!telegramPlayableItem) {
      setTgError('בחר סרט או פרק כדי לחפש כתוביות.');
      return;
    }

    void searchTelegramSubtitlesForItem(telegramPlayableItem);
  }, [searchTelegramSubtitlesForItem, telegramPlayableItem]);

  const handleTelegramSourcePlay = useCallback((source: TelegramSearchResult) => {
    void playTelegramSource(source);
  }, [playTelegramSource]);

  const nearEndTriggerKey = useMemo(() => {
    if (!hasMore || isLoadingMore || showSearch || navContext) return null;
    if (librarySection === 'favorites' || librarySection === 'history' || librarySection === 'continue_watching') return null;
    return `${buildLoadMorePageKey(currentRootRequestKey, contentPage + 1)}::retry:${nearEndGeneration}`;
  }, [hasMore, isLoadingMore, showSearch, navContext, librarySection, currentRootRequestKey, contentPage, nearEndGeneration]);

  const displayMovies = useMemo(() => {
    if (showSearch) return decorateCorridorItems(searchResults, 'search');
    if (navContext?.type === 'seasons') return decorateCorridorItems(navContext.seasons, `seasons:${navContext.seriesId}`);
    if (navContext?.type === 'episodes') return decorateCorridorItems(navContext.episodes, `episodes:${navContext.seriesId}:${navContext.seasonNum}`);
    if (librarySection === 'continue_watching') return decorateCorridorItems(continueWatching, 'continue_watching');
    if (librarySection === 'favorites') return decorateCorridorItems(favorites, 'favorites');
    if (librarySection === 'history') return decorateCorridorItems(watchHistory, 'history');
    if (librarySection === 'telegram') return decorateCorridorItems(telegramItems, currentRootRequestKey);

    let base = librarySection === 'series' ? seriesItems : librarySection === 'israeli' ? israeliItems : baseMovies;
    return decorateCorridorItems(
      applyCatalogFilters(base, { sortMode, yearFilter, genreFilter: activeGenreFilter, randomSeed: shuffleSeed }),
      currentRootRequestKey
    );
  }, [showSearch, searchResults, navContext, librarySection, continueWatching, favorites, watchHistory, telegramItems, seriesItems, israeliItems, baseMovies, sortMode, yearFilter, activeGenreFilter, shuffleSeed, currentRootRequestKey]);

  const emptyLibraryStateMessage = useMemo(() => {
    if (showSearch || navContext || isLoadingContent || displayMovies.length > 0) return null;
    if (librarySection === 'continue_watching') return 'עדיין אין תכנים להמשך צפייה';
    if (librarySection === 'favorites') return 'עדיין לא סימנת תכנים כמועדפים';
    if (librarySection === 'history') return 'היסטוריית הצפייה שלך תופיע כאן אחרי שתתחיל לצפות';
    if (librarySection === 'telegram' && !tgConfigured) return 'Telegram עדיין לא מוגדר בשרת';
    if (librarySection === 'telegram' && tgStatus !== 'loggedIn') return 'התחבר לחשבון Telegram כדי להציג את הקבוצות והערוצים שלך';
    if (librarySection === 'telegram') return 'לא נמצאו קבוצות או ערוצים להצגה בחשבון Telegram הזה';
    return null;
  }, [showSearch, navContext, isLoadingContent, displayMovies.length, librarySection, tgConfigured, tgStatus]);

  const displayMoviesRef = useRef(displayMovies);
  useEffect(() => { displayMoviesRef.current = displayMovies; }, [displayMovies]);

  const posterLayout = useMemo(() => buildPosterLayout(displayMovies), [displayMovies]);
  const posterSlots = useMemo(
    () => buildPosterSlotWindow(posterLayout, cameraZ, corridorTierConfig),
    [cameraZ, corridorTierConfig, posterLayout]
  );
  const posterTextureIntents = useMemo(
    () => resolvePosterTextureIntents(posterSlots, focusedId, corridorTierConfig),
    [corridorTierConfig, focusedId, posterSlots]
  );

  const lastPosterZ = useMemo(() => getLastPosterZ(posterLayout), [posterLayout]);
  const focusedCorridorItem = useMemo(
    () => displayMovies.find((item) => item.uniqueId === focusedId) ?? null,
    [displayMovies, focusedId]
  );
  const focusedMediaState = useMemo(
    () => (
      focusedCorridorItem
        ? mediaStateMap[buildMediaKey(focusedCorridorItem)] ?? createDefaultMediaStateEntry(focusedCorridorItem)
        : null
    ),
    [focusedCorridorItem, mediaStateMap]
  );
  const corridorTextureStats = useMemo(() => {
    const counts: Record<PosterTextureState, number> = { empty: 0, thumb: 0, full: 0, failed: 0 };
    Object.values(corridorTextureStates).forEach((state) => {
      counts[state] += 1;
    });
    return counts;
  }, [corridorTextureStates]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    console.log('APP_RUNTIME_STATE', {
      layer: activeShellLayer,
      sidebarOpen: !isLocked,
      showSearch,
      navContext: navContext?.type ?? null,
      librarySection,
      movieCategory,
      seriesCategory,
      israeliCategory,
      focusedId,
      posters: displayMovies.length,
      textureStats: corridorTextureStats
    });
  }, [
    activeShellLayer,
    corridorTextureStats,
    displayMovies.length,
    focusedId,
    isLocked,
    israeliCategory,
    librarySection,
    movieCategory,
    navContext,
    seriesCategory,
    showSearch
  ]);

  const handlePosterTextureStateChange = useCallback((slotId: string, state: PosterTextureState) => {
    setCorridorTextureStates((current) => {
      if (current[slotId] === state) return current;
      return {
        ...current,
        [slotId]: state
      };
    });
  }, []);

  useEffect(() => {
    const initialItems = displayMovies.slice(0, corridorTierConfig.maxThumbPrefetch);
    const prefetchKey = initialItems.map((item) => item.uniqueId || `${item.mediaType}:${item.id}`).join('|');
    if (!prefetchKey || lastInitialPosterPrefetchKeyRef.current === prefetchKey) return;
    lastInitialPosterPrefetchKeyRef.current = prefetchKey;
    prefetchPostersForItems(initialItems, corridorTierConfig.maxThumbPrefetch);
  }, [corridorTierConfig.maxThumbPrefetch, displayMovies, prefetchPostersForItems]);

  useEffect(() => {
    const visibleItems = posterSlots
      .map((slot) => slot.item)
      .filter((item): item is CorridorItem => Boolean(item));
    const prefetchKey = visibleItems
      .map((item) => item.uniqueId || `${item.mediaType}:${item.id}`)
      .join('|');
    if (!prefetchKey || lastVisiblePosterPrefetchKeyRef.current === prefetchKey) return;
    lastVisiblePosterPrefetchKeyRef.current = prefetchKey;
    prefetchPostersForItems(visibleItems, corridorTierConfig.maxThumbPrefetch);
  }, [corridorTierConfig.maxThumbPrefetch, posterSlots, prefetchPostersForItems]);

  useEffect(() => {
    setCorridorTextureStates({});
    lastInitialPosterPrefetchKeyRef.current = null;
    lastVisiblePosterPrefetchKeyRef.current = null;
  }, [corridorScopeKey]);

  // --- Remote Control logic ---
  const performBackAction = useCallback((source: 'capacitor' | 'keyboard' = 'keyboard') => {
    const timestamp = Date.now();
    if (shouldIgnoreBackEvent(lastBackHandledAtRef.current, timestamp, BACK_EVENT_DEBOUNCE_MS)) {
      if (import.meta.env.DEV) {
        console.log('BACK_EVENT', { timestamp, source, ignored: true, layer: activeShellLayerRef.current });
      }
      return;
    }

    lastBackHandledAtRef.current = timestamp;
    const snapshot = shellSnapshotRef.current;
    const backAction = resolveAppBackAction(snapshot);
    if (import.meta.env.DEV) {
      console.log('BACK_EVENT', {
        timestamp,
        source,
        action: backAction,
        layer: activeShellLayerRef.current
      });
    }

    switch (backAction) {
      case 'closePlayer':
        void closePlayer();
        return;
      case 'closePosterContext':
        setPosterContextMovie(null);
        return;
      case 'closeTelegramAuth':
        closeTelegramAuthSurface();
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
        setNavContext((prev) => stepOutOfNavContext(prev));
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
  }, [closePlayer, closeSearchSurface, closeSettingsSurface, closeTelegramAuthSurface]);

  useEffect(() => {
    const sub = CapApp.addListener('backButton', () => performBackAction('capacitor'));
    return () => { sub.then((listener) => listener.remove()); };
  }, [performBackAction]);

  useEffect(() => {
    const handleGlobalBackKey = (event: KeyboardEvent) => {
      if (!shouldHandleGlobalTvBack(event, {
        isEditableTarget: isEditableTextTarget(event.target),
        hasLocalBackHandler: hasLocalBackHandlerTarget(event.target),
        allowGlobalWhenLocalHandler: activeShellLayerRef.current === 'corridor'
      })) {
        return;
      }

      stopTvEvent(event);
      performBackAction('keyboard');
    };

    window.addEventListener('keydown', handleGlobalBackKey, true);
    return () => window.removeEventListener('keydown', handleGlobalBackKey, true);
  }, [performBackAction]);

  const telegramStatusLabel = !tgConfigured
    ? 'Telegram API לא מוגדר בשרת'
    : tgStatus === 'loggedIn'
      ? 'מחובר לחשבון Telegram'
      : tgStatus === 'checking'
        ? 'בודק חיבור Telegram'
        : tgStatus === 'phoneInput'
          ? 'מוכן לשליחת קוד אימות'
        : tgStatus === 'codeInput'
          ? 'ממתין לקוד אימות'
          : tgStatus === 'passwordInput'
            ? 'ממתין לסיסמת 2FA'
            : 'עדיין לא מחובר ל-Telegram';
  const telegramStatusTone = !tgConfigured
    ? 'bg-red-400'
    : tgStatus === 'loggedIn'
      ? 'bg-emerald-400'
      : tgStatus === 'checking'
        ? 'bg-amber-400'
        : 'bg-white/40';
  const updatePrimaryActionLabel = updateState.permissionState === 'needs_permission' && updateState.downloadedApk
    ? 'אפשר התקנה'
    : updateState.phase === 'ready_to_install'
      ? 'התקן עכשיו'
      : updateState.phase === 'downloading'
        ? 'מוריד עדכון...'
        : 'עדכן עכשיו';
  const handlePrimaryUpdateAction = () => {
    if (updateState.permissionState === 'needs_permission' && updateState.downloadedApk) {
      void openUpdatePermissionSettings();
      return;
    }
    if (updateState.phase === 'ready_to_install') {
      void installDownloadedUpdate();
      return;
    }
    void startUpdateInstallFlow();
  };

  return (
    <div
      className="hc-app-shell w-full h-screen overflow-hidden bg-black text-white"
      dir="rtl"
      data-testid="app-shell"
      data-active-section={librarySection}
      data-active-item-id={getActiveMenuItemId({
        librarySection,
        activeGenreId: movieGenreId,
        seriesGenreFilter,
        yearFilter,
        movieCategory,
        seriesCategory,
        israeliCategory,
        telegramCategory,
        showSearch
      })}
      data-root-request-key={currentRootRequestKey}
      data-sidebar-open={String(!isLocked)}
      data-search-open={String(showSearch)}
      data-poster-count={String(displayMovies.length)}
    >
      <Canvas camera={{ position: [0, 1.6, 2], fov: 75 }}>
        <ambientLight intensity={0.52} />
        <directionalLight position={[0, 6.8, 6]} intensity={0.9} color="#d7f7ff" />
        <Suspense fallback={null}>
          <group>
            <CorridorShell
              cameraZ={cameraZ}
              config={IMAX_CORRIDOR_SHELL_CONFIG}
              tierConfig={corridorTierConfig}
            />
            {posterSlots.map((slot) => (
              <CorridorPosterSlot
                key={slot.slotId}
                slot={slot}
                textureIntent={posterTextureIntents.get(slot.slotId) ?? 'thumb'}
                isFocused={focusedId === slot.uniqueId}
                isFavorited={Boolean(slot.item && mediaStateMap[buildMediaKey(slot.item)]?.favorite)}
                watchStatus={slot.item ? (mediaStateMap[buildMediaKey(slot.item)]?.watchStatus ?? 'unwatched') : 'unwatched'}
                onTextureStateChange={handlePosterTextureStateChange}
              />
            ))}
          </group>
          <TVController posterLayout={posterLayout} isLocked={isLocked} onPosterSelect={handlePosterSelect} onPosterLongPress={setPosterContextMovie} onHeartToggle={handleHeartToggle} setFocusedId={setFocusedId} setFocusedHeartId={setFocusedHeartId} isAnyModalOpen={isAnyShellOverlayOpen} lastPosterZ={lastPosterZ} nearEndTriggerKey={nearEndTriggerKey} cameraResetKey={corridorScopeKey} onNearEnd={loadMoreContent} onCameraMove={setCameraZ} />
        </Suspense>
      </Canvas>

      {!showSearch && !selectedMovie && !showCinemaScreen && !showTelegramAuthModal && !showSettings && !posterContextMovie && focusedCorridorItem && focusedMediaState && (
        <CorridorFocusOverlay
          item={focusedCorridorItem}
          isFavorited={Boolean(focusedMediaState.favorite)}
          watchStatus={focusedMediaState.watchStatus}
        />
      )}

      {showCorridorDebug && (
        <div className="hc-tv-safe-top-left absolute z-40 mt-16 rounded-[24px] border border-white/10 bg-black/75 px-4 py-3 text-xs text-white/70 backdrop-blur-xl">
          <div className="font-semibold text-[#7debd6]">Corridor Debug</div>
          <div className="mt-2">Tier: {corridorTierConfig.tier}</div>
          <div>Visible slots: {posterSlots.filter((slot) => slot.item).length}/{corridorTierConfig.visiblePosterSlots}</div>
          <div>Thumb: {corridorTextureStats.thumb} | Full: {corridorTextureStats.full}</div>
          <div>Failed: {corridorTextureStats.failed} | Empty: {corridorTextureStats.empty}</div>
          <div>Cache: {textureManager.getStats().cached} | Pending: {textureManager.getStats().pending}</div>
        </div>
      )}

      <AnimatePresence>
        {showUpdatePrompt && updateState.manifest && (
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 18 }}
            className="hc-tv-safe-top-left absolute z-40 mt-16 max-w-xl rounded-[32px] border border-[#2AABEE]/25 bg-[linear-gradient(180deg,rgba(10,18,26,0.94),rgba(6,10,15,0.9))] p-6 shadow-[0_20px_80px_rgba(0,0,0,0.45)] backdrop-blur-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[11px] uppercase tracking-[0.3em] text-[#7debd6]">עדכון זמין</div>
                <h3 className="mt-3 text-2xl font-semibold text-white">
                  HoloCinema {updateState.manifest.version}
                </h3>
                <p className="mt-2 text-sm text-white/65">
                  נמצאה גרסה חדשה להורדה והתקנה. העדכון ישמור על המועדפים, ההיסטוריה והחיבור הקיים למערכת.
                </p>
              </div>
              <button onClick={() => setShowUpdatePrompt(false)} className="hc-close-button p-2">
                <X size={18} />
              </button>
            </div>

            {updateState.manifest.notes.length > 0 && (
              <div className="mt-4 space-y-2 text-sm text-white/70">
                {updateState.manifest.notes.slice(0, 3).map((note, index) => (
                  <div key={`${updateState.manifest?.version}-${index}`} className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3">
                    {note}
                  </div>
                ))}
              </div>
            )}

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                onClick={handlePrimaryUpdateAction}
                disabled={updateState.phase === 'downloading' || updateState.phase === 'installing'}
                className="hc-button hc-button--accent px-5 py-3 text-sm"
              >
                {updatePrimaryActionLabel}
              </button>
              <button
                onClick={() => {
                  setShowUpdatePrompt(false);
                  openSettingsPanel('updates');
                }}
                className="hc-button hc-button--ghost px-5 py-3 text-sm"
              >
                פרטי עדכון
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {(isLoadingContent || isLoadingMore) && (
        <div className="hc-tv-safe-top-left absolute z-30 flex items-center gap-3 rounded-full border border-[#00ffcc]/20 bg-black/70 px-5 py-3 backdrop-blur-md">
          <Loader2 className="animate-spin text-[#00ffcc]" size={20} />
          <span className="text-sm text-white/80">{isLoadingContent ? 'טוען תוכן...' : 'טוען עוד...'}</span>
        </div>
      )}

      {hierarchyMeta && (
        <div className="hc-tv-safe-top-right absolute z-30 max-w-[34rem] rounded-[28px] border border-[#00ffcc]/18 bg-[linear-gradient(180deg,rgba(3,10,14,0.86),rgba(4,8,12,0.72))] px-6 py-4 text-right shadow-[0_0_40px_rgba(0,0,0,0.35)] backdrop-blur-xl">
          <div className="text-[11px] uppercase tracking-[0.34em] text-[#7debd6]">{hierarchyMeta.eyebrow}</div>
          <div className="mt-2 text-2xl font-semibold text-white">{hierarchyMeta.title}</div>
          <div className="mt-2 text-sm text-white/55">{hierarchyMeta.trail}</div>
          <div className="mt-3 inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-white/75">
            <span>{hierarchyMeta.detail}</span>
            <span className="text-[#7debd6]">Back לחזרה</span>
          </div>
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

      {emptyLibraryStateMessage && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 text-center">
          <div className="hc-empty-state px-8 py-6">
            <div className="text-xl font-semibold text-white">{emptyLibraryStateMessage}</div>
            <div className="mt-2 text-sm text-white/55">אפשר לפתוח את הסרגל הראשי ולעבור לקטלוג, לחיפוש או לטלגרם.</div>
          </div>
          {false ? (
            <button onClick={() => openSettingsPanel('telegram')} className="hc-button hc-button--accent px-6 py-3 text-sm">
              פתח חיבור טלגרם
            </button>
          ) : (
            <button onClick={() => setIsLocked(false)} className="hc-button hc-button--accent px-6 py-3 text-sm">
              פתח תפריט ראשי
            </button>
          )}
        </div>
      )}

      <AnimatePresence>
        {showSearch && isLocked && (
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="hc-panel hc-tv-safe-top-right absolute z-50 w-[35rem] p-6" data-tv-scope="ui">
            <div className="flex items-center gap-4">
              <div className="hc-badge px-4 py-4 text-[#00ffcc]"><Search size={24} /></div>
              <input autoFocus value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="חפש סרט או סדרה..." data-testid="search-input" className="hc-input flex-1 border-none bg-transparent px-0 py-0 text-2xl shadow-none focus:border-none focus:bg-transparent focus:shadow-none" />
              {isSearchingTmdb && <Loader2 className="animate-spin text-[#00ffcc]" />}
              <button onClick={closeSearchSurface} className="hc-close-button p-2 opacity-80"><X /></button>
            </div>
            {!searchError && (searchQuery.trim() ? searchResultSourceSummaries : librarySourceSummaries).length > 0 && (
              <div className="hc-chip-row mt-5">
                {(searchQuery.trim() ? searchResultSourceSummaries : librarySourceSummaries).map((summary) => (
                  <div key={summary.id} className="hc-chip">
                    {summary.label} ({summary.count})
                  </div>
                ))}
              </div>
            )}
            {searchError && (
              <div className="mt-6 text-center text-red-400">{searchError}</div>
            )}
            {!searchError && !searchQuery.trim() && (
              <div className="mt-6 text-center text-sm text-white/60">התחל להקליד כדי להחליף את המסדרון בתוצאות חיפוש. עד אז מוצגים כאן קיצורי הדרך של הספרייה האישית שלך.</div>
            )}
            {!searchError && searchQuery.trim().length > 0 && searchQuery.trim().length < 3 && !isSearchingTmdb && (
              <div className="mt-6 text-center text-gray-500">הקלד לפחות 3 תווים לחיפוש</div>
            )}
            {!searchError && searchResults.length === 0 && searchQuery.trim().length >= 3 && !isSearchingTmdb && (
              <div className="mt-6 text-center text-gray-500">לא נמצאו תוצאות</div>
            )}
            {!searchError && searchPreviewItems.length > 0 && (
              <div className="hc-panel-section mt-6 p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="text-sm font-semibold text-white">
                    {searchQuery.trim() ? 'התאמות מובילות' : 'ממשיכים מאיפה שעצרת'}
                  </div>
                  <div className="text-[11px] uppercase tracking-[0.24em] text-[#7debd6]">
                    {searchQuery.trim() ? 'Live corridor results' : 'Your library'}
                  </div>
                </div>
                <div className="mt-3 space-y-2">
                  {searchPreviewItems.map((item) => (
                    <div key={`${item.mediaType}:${item.id}`} className="hc-card flex items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-white">{item.localizedTitle || item.title}</div>
                        <div className="mt-1 truncate text-xs text-white/45">{item.seriesTitle || item.originalTitle || item.genre || item.mediaType}</div>
                      </div>
                      <div className="hc-chip shrink-0 border-[#00ffcc]/20 bg-[#00ffcc]/10 text-[11px] text-[#7debd6]">
                        {getSearchSourceLabel(classifySearchSource(item, searchSourceLookup))}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 text-xs text-white/45">
                  {searchQuery.trim()
                    ? 'התוצאות המלאות כבר נטענו במסדרון, כך שאפשר לבחור אותן מיד עם השלט.'
                    : 'המשך צפייה, מועדפים והיסטוריה זמינים גם כמסדרונות קבועים דרך הסרגל הראשי.'}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedMovie && showCinemaScreen && (
          <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }}>
            <CinemaGate
              title={selectedMovie.title}
              onOpenTelegramPanel={() => {
                if (tgStatus === 'loggedIn') {
                  openSettingsPanel('telegram');
                } else {
                  openTelegramAuthWizard(null);
                }
              }}
              onOpenGeneralSettings={() => openSettingsPanel('general')}
              onBackToDetails={() => setShowCinemaScreen(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showTelegramAuthModal && (
          <motion.div initial={{ opacity: 0, scale: 0.985 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.985 }}>
            <TelegramAuthWizard
              configured={tgConfigured}
              status={tgStatus}
              busy={tgBusy}
              pendingStage={tgAuthPendingStage}
              error={tgError}
              phoneDigits={tgPhoneDigits}
              phoneE164={tgPhoneE164}
              canStartLogin={canStartTelegramLogin}
              code={tgCode}
              password={tgPassword}
              onPhoneChange={handleTelegramPhoneDigitsChange}
              onCodeChange={setTgCode}
              onPasswordChange={setTgPassword}
              onStartLogin={() => { void startTelegramLogin(); }}
              onResendCode={() => { void startTelegramLogin(); }}
              onSubmitCode={() => { void submitTelegramCode(); }}
              onSubmitPassword={() => { void submitTelegramPassword(); }}
              onClose={closeTelegramAuthSurface}
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
              updatesPanelContent={
                <UpdateConsolePanel
                  currentVersion={appVersion}
                  currentBuild={appBuild}
                  packageId={appPackageId}
                  phase={updateState.phase}
                  permissionState={updateState.permissionState}
                  manifest={updateState.manifest}
                  error={updateState.error}
                  lastCheckedAt={updateState.lastCheckedAt}
                  onCheck={() => { void checkForUpdates({ force: true }); }}
                  onStartUpdate={() => { void startUpdateInstallFlow(); }}
                  onInstall={() => { void installDownloadedUpdate(); }}
                  onOpenPermissionSettings={() => { void openUpdatePermissionSettings(); }}
                />
              }
              telegramPanelContent={
                <TelegramConsolePanel
                  configured={tgConfigured}
                  status={tgStatus}
                  busy={tgBusy}
                  sourceSearchBusy={isSearchingTelegramSources}
                  subtitleSearchBusy={isSearchingTelegramSubtitles}
                  preparingSourceId={preparingTelegramSourceId}
                  error={tgError}
                  currentItem={telegramPlayableItem}
                  currentPlaybackTitle={activeMedia?.title ?? null}
                  preparedNextTitle={preparedNextPlayback?.title ?? null}
                  searchQuery={tgSearchQuery}
                  sources={tgSources}
                  subtitles={tgSubtitleResults}
                  selectedSubtitleUrl={tgSelectedSubtitleUrl}
                  onSearchQueryChange={setTgSearchQuery}
                  onSelectedSubtitleChange={setTgSelectedSubtitleUrl}
                  onRefreshStatus={() => { void refreshTelegramStatus(); }}
                  onLogout={() => { void logoutTelegram(); }}
                  onSearchSources={handleTelegramSourceSearch}
                  onSearchSubtitles={handleTelegramSubtitleSearch}
                  onPlaySource={handleTelegramSourcePlay}
                  formatBytes={formatBytes}
                />
              }
            />
          </motion.div>
        )}
      </AnimatePresence>

      <SideMenu
        visible={showSlimMenu}
        isOpen={!isLocked}
        groups={buildSideMenuGroups({
          movieGenres: [],
          seriesGenres: [],
          continueWatchingCount: continueWatching.length,
          favoritesCount: favorites.length,
          historyCount: watchHistory.length,
          telegramCount: telegramItems.length,
          telegramConnected: tgStatus === 'loggedIn'
        })}
        telegramConnected={tgStatus === 'loggedIn'}
        activeItemId={getActiveMenuItemId({
          librarySection,
          activeGenreId: movieGenreId,
          seriesGenreFilter,
          yearFilter,
          movieCategory,
          seriesCategory,
          israeliCategory,
          telegramCategory,
          showSearch
        })}
        currentLabel={
          showSearch ? 'חיפוש'
            : librarySection === 'continue_watching' ? 'המשך צפייה'
            : librarySection === 'favorites' ? 'מועדפים'
              : librarySection === 'history' ? 'היסטוריה'
                : librarySection === 'telegram' ? 'טלגרם'
                : librarySection === 'series' ? 'סדרות'
                  : librarySection === 'israeli' ? 'ישראלי'
                    : 'סרטים'
        }
        onActivate={handleMenuSelection}
        onOpen={() => setIsLocked(false)}
        onClose={() => setIsLocked(true)}
      />

      {selectedMovie && !activeMedia && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/90 p-[var(--hc-tv-safe-y)]" data-tv-scope="ui">
          <div className="hc-panel flex w-full max-w-6xl gap-12 rounded-[50px] p-12">
            <img src={selectedMovie.poster} className="w-96 rounded-[30px] shadow-2xl" />
            <div className="flex flex-col flex-1">
              <h2 className="text-6xl font-bold mb-6">{selectedMovie.title}</h2>
              <div className="mb-5 text-lg text-[#7debd6]">
                {selectedMovie.seriesTitle
                  ? `${selectedMovie.seriesTitle}${selectedMovie.seasonTitle ? ` / ${selectedMovie.seasonTitle}` : ''}`
                  : selectedMovie.mediaType === 'tv'
                    ? 'Series Corridor'
                    : selectedMovie.mediaType === 'season'
                      ? 'Season Corridor'
                      : selectedMovie.mediaType && isTelegramDialogMediaType(selectedMovie.mediaType)
                        ? 'Telegram Corridor'
                      : selectedMovie.mediaType === 'episode'
                        ? 'Episode Details'
                        : 'Movie Details'}
              </div>
              <p className="text-2xl text-gray-400 leading-relaxed mb-10">{selectedMovie.desc}</p>
              <div className="flex gap-6 mt-auto">
                <button onClick={handleSelectedMoviePrimaryAction} className="hc-button hc-button--telegram flex-1 rounded-3xl py-6 text-3xl font-bold">{selectedMoviePrimaryActionLabel}</button>
                <button onClick={() => { setShowCinemaScreen(false); setSelectedMovie(null); }} className="hc-button hc-button--ghost rounded-3xl px-12 py-6 text-2xl">סגור</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
