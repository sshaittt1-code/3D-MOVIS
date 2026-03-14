import React, { useState, useEffect, useRef, Suspense, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Text, SpotLight } from '@react-three/drei';
import * as THREE from 'three';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Search, LogOut, Settings, Film, X, Loader2, Eye, Clock3, Heart, HeartOff, SkipForward } from 'lucide-react';
import { App as CapApp } from '@capacitor/app';
import { textureManager } from './utils/TextureManager';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { registerPlugin } from '@capacitor/core';
import { applyCatalogFilters, getUniqueGenres, SORT_OPTIONS, YEAR_OPTIONS, type LibrarySection, type SortMode, type YearFilter } from './utils/catalog';
import { isRemoteVersionNewer } from './utils/version';
import { buildMediaKey, createDefaultMediaStateEntry, MEDIA_STATE_STORAGE_KEY, migrateLegacyMediaState, type MediaStateEntry, type WatchStatus, updateProgressState } from './utils/mediaState';
import { findNextEpisodeInSeason, findNextSeason, shouldPrepareNextEpisode } from './utils/nextEpisode';
import { readAutoPlayNextEpisode, writeAutoPlayNextEpisode } from './utils/playerSettings';

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

const fetchApiJson = async (path: string, init: RequestInit = {}) => {
  const sessionStr = localStorage.getItem('tg_session') || '';
  init.headers = {
    ...init.headers,
    'x-tg-session': sessionStr
  };
  const response = await fetch(path, init);
  const bodyText = await response.text();
  if (bodyText.trim().startsWith('<')) throw new Error('API returned HTML. Check API Base URL.');
  return JSON.parse(bodyText);
};

const buildApiUrl = (base: string, path: string) => `${base.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;

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
  url: string;
  title: string;
  subtitleUrl?: string;
  mediaItem: any;
  peerId: string;
  messageId: number;
};

type ActivePlayback = PreparedPlayback;

// --- 3D Components ---
const TVController = ({ posterLayout, isLocked, onPosterSelect, onHeartToggle, setFocusedId, setFocusedHeartId, isAnyModalOpen, selectedMovie, lastPosterZ, onNearEnd, onCameraMove }: any) => {
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

  useEffect(() => {
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
        if (focusedHeartRef.current) {
          onHeartToggle(focusedHeartRef.current);
        } else if (focusedMovieRef.current) {
          onPosterSelect(focusedMovieRef.current);
        }
      }
    };
    const handleInputUp = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') keys.current.left = false;
      else if (e.key === 'ArrowRight') keys.current.right = false;
      if (isLocked && !isAnyModalOpen && !selectedMovie && isTvNavigationKey(e)) stopTvEvent(e);
    };
    window.addEventListener('keydown', handleInput, true);
    window.addEventListener('keyup', handleInputUp, true);
    return () => {
      window.removeEventListener('keydown', handleInput, true);
      window.removeEventListener('keyup', handleInputUp, true);
    };
  }, [isLocked, onPosterSelect, onHeartToggle, isAnyModalOpen, selectedMovie]);

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
        <meshStandardMaterial map={texture} color={isFocused ? '#ffffff' : '#acacac'} />
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
  const [shuffleSeed, setShuffleSeed] = useState(() => Date.now());
  const [cameraZ, setCameraZ] = useState(2);
  const [transitionLabel, setTransitionLabel] = useState<string | null>(null);

  // Infinite scroll
  const [contentPage, setContentPage] = useState(1);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const [mediaStateMap, setMediaStateMap] = useState<Record<string, MediaStateEntry>>(() => {
    try {
      const savedState = JSON.parse(localStorage.getItem(MEDIA_STATE_STORAGE_KEY) || '{}');
      if (savedState && Object.keys(savedState).length > 0) return savedState;
    } catch {}

    try {
      const legacyFavorites = JSON.parse(localStorage.getItem('favorites') || '[]');
      const legacyHistory = JSON.parse(localStorage.getItem('watch_history') || '[]');
      return migrateLegacyMediaState(legacyFavorites, legacyHistory);
    } catch {
      return {};
    }
  });
  const [autoPlayNextEpisode, setAutoPlayNextEpisode] = useState<boolean>(() => {
    return readAutoPlayNextEpisode(localStorage, true);
  });

  useEffect(() => {
    localStorage.setItem(MEDIA_STATE_STORAGE_KEY, JSON.stringify(mediaStateMap));
  }, [mediaStateMap]);

  useEffect(() => {
    writeAutoPlayNextEpisode(localStorage, autoPlayNextEpisode);
  }, [autoPlayNextEpisode]);

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

  const handleHeartToggle = (uniqueId: string) => {
    const allItems = displayMoviesRef.current;
    const item = navContext?.type === 'seasons'
      ? navContext.seasons.find((s: any) => s.uniqueId === uniqueId)
      : navContext?.type === 'episodes'
        ? navContext.episodes.find((e: any) => e.uniqueId === uniqueId)
        : allItems.find(m => m.uniqueId === uniqueId);
    if (!item) return;

    upsertMediaState(item, (entry) => ({
      ...entry,
      snapshot: { ...entry.snapshot, ...item },
      favorite: !entry.favorite
    }));
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

  const buildPreparedPlayback = async (telegramResult: any, mediaItem: any): Promise<PreparedPlayback> => {
    const sessionStr = localStorage.getItem('tg_session') || '';
    const videoUrl = buildApiUrl(normalizedApiBase, `/api/tg/stream/${telegramResult.peerId}/${telegramResult.id}?session=${sessionStr}`);
    let subtitleUrl: string | undefined;

    try {
      const subData = await fetch(buildApiUrl(normalizedApiBase, `/api/tg/search-subtitles?query=${encodeURIComponent(mediaItem.title || telegramResult.title)}`)).then(res => res.json());
      subtitleUrl = subData.results?.[0]
        ? buildApiUrl(normalizedApiBase, `/api/tg/subtitle/${subData.results[0].peerId}/${subData.results[0].id}`)
        : undefined;
    } catch {
      subtitleUrl = undefined;
    }

    return {
      url: videoUrl,
      title: mediaItem.title || telegramResult.title,
      subtitleUrl,
      mediaItem,
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

    const seasonsData = await fetch(buildApiUrl(normalizedApiBase, `/api/series/${episode.seriesId}`)).then((response) => response.json());
    const seasons = seasonsData.seasons || [];
    const nextSeason = findNextSeason(currentSeasonNumber, seasons);
    if (!nextSeason) return null;

    const nextSeasonData = await fetch(buildApiUrl(normalizedApiBase, `/api/series/${episode.seriesId}/season/${nextSeason.season_number}`)).then((response) => response.json());
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

  const closePlayer = () => {
    if (activeMedia?.mediaItem && videoRef.current) {
      const currentTime = videoRef.current.currentTime || 0;
      const duration = Number.isFinite(videoRef.current.duration) ? videoRef.current.duration : 0;
      upsertMediaState(activeMedia.mediaItem, (entry) => updateProgressState(activeMedia.mediaItem, entry, currentTime, duration));
    }
    setActiveMedia(null);
    setPreparedNextMedia(null);
    setNextEpisodeOverlay(null);
  };

  // Buffering States
  const [isBuffering, setIsBuffering] = useState(false);
  const [bufferProgress, setBufferProgress] = useState(0);

  const [apiBase, setApiBase] = useState(() => localStorage.getItem('api_base') || API_BASE);
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
    fetch(buildApiUrl(normalizedApiBase, '/api/genres'))
      .then(r => r.json())
      .then(data => setGenreList(data.genres || []));
  }, [normalizedApiBase]);

  useEffect(() => {
    fetch(buildApiUrl(normalizedApiBase, '/api/version'))
      .then(res => res.json())
      .then(data => {
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
      .catch(() => {});
  }, [CURRENT_VERSION, normalizedApiBase]);

  useEffect(() => {
    const sessionStr = localStorage.getItem('tg_session') || '';
    fetch(buildApiUrl(normalizedApiBase, '/api/tg/status'), { headers: { 'x-tg-session': sessionStr } })
      .then(res => res.json())
      .then(data => setTgStatus(data.loggedIn ? 'loggedIn' : 'loggedOut'))
      .catch(() => setTgStatus('loggedOut'));
  }, [normalizedApiBase]);

  useEffect(() => {
    playbackProgressRef.current = 0;
    preloadAttemptKeyRef.current = null;
    dismissedAutoPlayRef.current = null;
    setPreparedNextMedia(null);
    setNextEpisodeOverlay(null);
  }, [activeMedia?.mediaItem?.id, activeMedia?.mediaItem?.season_number, activeMedia?.mediaItem?.episode_number]);

  const exitPressCount = useRef(0);
  const exitTimeout = useRef<any>(null);

  // Hardware Back Button Interceptor for Android TV (so remote 'Back' doesn't kill the app)
  useEffect(() => {
    const handleBackEvent = () => {
      if (activeMedia) { closePlayer(); return; }
      if (showCinemaScreen) { setShowCinemaScreen(false); return; }
      if (showSettings) { setShowSettings(false); return; }
      if (tgStatus === 'phoneInput' || tgStatus === 'codeInput' || tgStatus === 'passwordInput') {
        setTgStatus('loggedOut'); 
        return; 
      }
      if (isLocked) {
        setIsLocked(false);
        setFocusedId(null);
        return;
      }
      
      // In Main Menu Root
      exitPressCount.current += 1;
      if (exitPressCount.current >= 3) {
        CapApp.exitApp();
      } else {
        clearTimeout(exitTimeout.current);
        exitTimeout.current = setTimeout(() => { exitPressCount.current = 0; }, 2000);
      }
    };

    let backListener: any;
    CapApp.addListener('backButton', handleBackEvent).then(l => backListener = l);
    return () => { if (backListener) backListener.remove(); };
  }, [activeMedia, showCinemaScreen, showSettings, isLocked, tgStatus]);

  useEffect(() => {
    const handleGlobalBack = (e: KeyboardEvent) => {
      // Catch conventional keyboard ESC for Web compatibility
      if (e.key === 'Escape' || e.key === 'Backspace') {
        if (navContext) {
          stopTvEvent(e);
          if (navContext.type === 'episodes') {
            // go back to seasons
            setNavContext(prev => prev && prev.type === 'episodes' ? { type: 'seasons', seriesId: prev.seriesId, seriesTitle: prev.seriesTitle, seasons: [] } : null);
            // Re-fetch seasons
            const base = apiBase.replace(/\/$/, '');
            const ctx = navContext as any;
            fetch(`${base}/api/series/${ctx.seriesId}`) .then(r => r.json())
              .then(data => {
                const seasons = (data.seasons || []).map((s: any, i: number) => ({ ...s, uniqueId: `season-${s.id}-${i}` }));
                setNavContext({ type: 'seasons', seriesId: ctx.seriesId, seriesTitle: ctx.seriesTitle, seasons });
              });
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
        if (showCinemaScreen) {
          stopTvEvent(e);
          setShowCinemaScreen(false);
          return;
        }
        if (showSettings) {
          stopTvEvent(e);
          setShowSettings(false);
          return;
        }
        if (isLocked) {
          stopTvEvent(e);
          setIsLocked(false);
          setFocusedId(null);
        }
      }
    };
    
    const handleMenuInput = (e: KeyboardEvent) => {
      if (!isTvSelectKey(e)) return;
      
      // Let standard HTML buttons/inputs handle the OK click native to Android Webview
      const activeTag = document.activeElement?.tagName.toLowerCase();
      const isInputFocused = activeTag === 'input' || activeTag === 'button' || activeTag === 'a';
      if (isInputFocused) return;
      
      // If we are showing the corridor and nothing selected yet, start playing
      if (!isLocked && !selectedMovie && !showCinemaScreen) {
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
  }, [isLocked, selectedMovie, showCinemaScreen, showSettings, activeMedia, tgStatus]);

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

  // Initial movie fetch
  useEffect(() => {
    if (genre === 'סדרות' || genre === 'מועדפים' || genre === 'צפיות אחרונות') return;
    if (!isMoviesSection) return;
    const genreParam = activeGenreId ? `&genre_id=${activeGenreId}` : '';
    setContentPage(1);
    setHasMore(true);
    setIsLoadingMore(false);
    setFetchError(null);
    fetch(buildApiUrl(normalizedApiBase, `/api/movies?page=1${genreParam}`))
      .then(res => { if (!res.ok) throw new Error(`HTTP Error: ${res.status}`); return res.json(); })
      .then(data => {
        setBaseMovies(data.movies && data.movies.length > 0 ? data.movies : BASE_MOVIES);
        setHasMore(data.hasMore ?? false);
      })
      .catch((err) => {
        setFetchError(`שגיאת תקשורת: ${err.message}`);
        setBaseMovies(BASE_MOVIES);
        setShowSettings(true);
      });
  }, [activeGenreId, genre, isMoviesSection, normalizedApiBase]);

  useEffect(() => {
    if (!isMoviesSection || baseMovies.length === 0) return;

    let cancelled = false;
    const posterUrls = baseMovies
      .slice(0, 100)
      .map((movie: any) => movie.poster)
      .filter(Boolean);

    const preloadInitialBatch = async () => {
      const batchSize = 6;
      for (let i = 0; i < posterUrls.length && !cancelled; i += batchSize) {
        const batch = posterUrls.slice(i, i + batchSize);
        await Promise.all(batch.map((url: string) => textureManager.loadTexture(url).catch(() => null)));
      }
    };

    preloadInitialBatch();

    return () => {
      cancelled = true;
    };
  }, [baseMovies, isMoviesSection]);

  // Load more movies when reaching the end
  const handleNearEnd = () => {
    if (isMoviesSection && baseMovies.length === 0) return;
    if (!isMoviesSection) return;
    if (isLoadingMore || !hasMore || navContext || genre === 'סדרות' || genre === 'מועדפים' || genre === 'צפיות אחרונות' || showSearch) return;
    const nextPage = contentPage + 1;
    const genreParam = activeGenreId ? `&genre_id=${activeGenreId}` : '';
    setIsLoadingMore(true);
    fetch(buildApiUrl(normalizedApiBase, `/api/movies?page=${nextPage}${genreParam}`))
      .then(r => r.json())
      .then(data => {
        setBaseMovies(prev => [...prev, ...(data.movies || [])]);
        setContentPage(nextPage);
        setHasMore(data.hasMore ?? false);
      })
      .finally(() => setIsLoadingMore(false));
  };

  // Fetch series when genre switches to 'סדרות'
  useEffect(() => {
    if (genre !== 'סדרות') return;
    if (!isSeriesSection) return;
    fetch(buildApiUrl(normalizedApiBase, '/api/series?page=1'))
      .then(r => r.json())
      .then(data => {
        setSeriesItems(data.series || []);
        setFetchError(data.series?.length ? null : 'לא נמצאו סדרות לטעינה.');
      })
      .catch((err) => setFetchError(`שגיאת סדרות: ${err.message}`));
  }, [genre, isSeriesSection, normalizedApiBase]);

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
      const data = await fetch(buildApiUrl(normalizedApiBase, `/api/series/${series.id}`)).then(r => r.json());
      const seasons = (data.seasons || []).map((s: any, i: number) => ({ ...s, uniqueId: `season-${s.id}-${i}` }));
      setNavContext({ type: 'seasons', seriesId: series.id, seriesTitle: series.title, seasons });
    });
  };

  // Navigate into a season’s episodes
  const enterSeason = async (season: any) => {
    await runCorridorTransition(`Entering ${season.title}`, async () => {
      const data = await fetch(buildApiUrl(normalizedApiBase, `/api/series/${season.seriesId}/season/${season.season_number}`)).then(r => r.json());
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
    if (genre === 'סדרות') { enterSeries(movie); return; }
    setSelectedMovie(movie); // normal movie/favorite - open Telegram search
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

  const renderedPosterLayout = useMemo(() => (
    posterLayout.filter(({ position }) => {
      const z = position[2] as number;
      return z < cameraZ + 28 && z > cameraZ - 90;
    })
  ), [cameraZ, posterLayout]);

  const lastPosterZ = posterLayout.length > 0
    ? posterLayout[posterLayout.length - 1].position[2] as number
    : -2;

  // Trigger TMDB search
  const handleTmdbSearch = () => {
    if (!searchQuery.trim()) return;
    setIsSearchingTmdb(true);
    fetch(buildApiUrl(normalizedApiBase, `/api/search?q=${encodeURIComponent(searchQuery)}&type=${isSeriesSection ? 'tv' : 'all'}`))
      .then(r => r.json())
      .then(data => { setSearchResults(data.results || []); setIsSearchingTmdb(false); })
      .catch(() => setIsSearchingTmdb(false));
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

  const handlePlayVideo = async (telegramResult: any, mediaItem: any = selectedMovie) => {
    if (!mediaItem) return;
    setIsBuffering(true);
    setBufferProgress(0);
    saveToHistory(mediaItem);
    
    let progress = 0;
    const interval = setInterval(() => {
      progress += 5;
      setBufferProgress(progress);
      if (progress >= 100) {
        clearInterval(interval);
        setIsBuffering(false);
        buildPreparedPlayback(telegramResult, mediaItem)
          .then((prepared) => {
            setShowCinemaScreen(false);
            setSelectedMovie(null);
            setActiveMedia(prepared);
          })
          .catch(() => setActiveMedia(null));
      }
    }, 300);
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

  const handleVideoEnded = () => {
    if (activeMedia?.mediaItem && videoRef.current) {
      const duration = Number.isFinite(videoRef.current.duration) ? videoRef.current.duration : activeMedia.mediaItem.durationSeconds || 0;
      upsertMediaState(activeMedia.mediaItem, (entry) => updateProgressState(activeMedia.mediaItem, entry, duration, duration));
    }

    if (autoPlayNextEpisode && preparedNextMedia) {
      setActiveMedia(preparedNextMedia);
      return;
    }

    closePlayer();
  };

  const selectedMediaEntry = selectedMovie ? getMediaEntry(selectedMovie) : null;

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
            onHeartToggle={handleHeartToggle}
            setFocusedId={setFocusedId}
            setFocusedHeartId={setFocusedHeartId}
            isAnyModalOpen={!!selectedMovie || showCinemaScreen}
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
      {isLocked && !selectedMovie && !showCinemaScreen && (
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
                            localStorage.setItem('tg_session', res.sessionString);
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
                          localStorage.setItem('tg_session', res.sessionString);
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

      {!isLocked && !selectedMovie && (
        <div className="absolute inset-0 z-20 flex bg-black/80 backdrop-blur-xl">
          <div className="w-80 h-full bg-black/90 p-8 border-l border-[#00ffcc]/30 flex flex-col shadow-2xl">
            <h1 className="text-3xl font-bold text-[#00ffcc] mb-10">HoloCinema</h1>
            <button onClick={() => setIsLocked(true)} className="py-5 bg-[#00ffcc] text-black font-bold rounded-2xl focus:ring-4 focus:ring-white">כניסה למסדרון</button>
            <button onClick={() => { setShowSearch(true); setSearchQuery(''); setSearchResults([]); setIsLocked(true); }} className="mt-3 py-4 bg-white/10 hover:bg-white/20 text-white font-bold rounded-2xl w-full text-lg transition-colors border border-white/10">🔍 חפש תוכן</button>
            <div className="mt-6 flex flex-col gap-2 overflow-y-auto flex-1">
              <div className="space-y-2">
                {SPECIAL_LIBRARY_SECTIONS.map((section) => (
                  <button
                    key={section.id}
                    onClick={() => {
                      setLibrarySection(section.id);
                      setGenre(section.id === 'series' ? 'סדרות' : section.id === 'favorites' ? 'מועדפים' : 'צפיות אחרונות');
                      setActiveGenreId(null);
                      setSeriesGenreFilter(null);
                      setNavContext(null);
                    }}
                    className={`p-3 rounded-xl text-right transition-all text-sm w-full ${(librarySection === section.id && !navContext) ? 'bg-[#00ffcc] text-black font-bold' : 'bg-white/5 hover:bg-white/10'}`}
                  >
                    {section.icon} {section.label}
                    {section.id === 'favorites' ? ` (${favorites.length})` : section.id === 'history' ? ` (${watchHistory.length})` : ''}
                  </button>
                ))}
                <div className="border-t border-white/10 my-2" />
                <button onClick={() => { setLibrarySection('all'); setGenre('הכל'); setNavContext(null); }} className={`p-3 rounded-xl text-right transition-all text-sm w-full ${librarySection === 'all' && !navContext ? 'bg-[#00ffcc] text-black font-bold' : 'bg-white/5 hover:bg-white/10'}`}>🎬 סרטים</button>
                <p className="text-xs text-gray-500 px-1">{isSeriesSection ? 'קטגוריות סדרות' : 'קטגוריות סרטים'}</p>
                <div className="grid grid-cols-2 gap-2">
                  {SORT_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      onClick={() => {
                        setSortMode(option.id);
                        if (option.id === 'random') setShuffleSeed(Date.now());
                      }}
                      className={`p-2 rounded-xl text-xs transition-all ${sortMode === option.id ? 'bg-[#00ffcc] text-black font-bold' : 'bg-white/5 hover:bg-white/10'}`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {YEAR_OPTIONS.map((option) => (
                    <button key={option.id} onClick={() => setYearFilter(option.id)} className={`p-2 rounded-xl text-xs transition-all ${yearFilter === option.id ? 'bg-[#00ffcc] text-black font-bold' : 'bg-white/5 hover:bg-white/10'}`}>{option.label}</button>
                  ))}
                </div>
                {!isSeriesSection && (genreList.length > 0 ? genreList : [{ id: 0, name: 'הכל', tmdbId: null }]).map((g: any) => (
                  <button key={g.id} onClick={() => { setLibrarySection('all'); setGenre('הכל'); setActiveGenreId(g.tmdbId); setNavContext(null); }} className={`p-3 rounded-xl text-right transition-all text-sm w-full ${activeGenreId === g.tmdbId && librarySection === 'all' && !navContext ? 'bg-[#00ffcc] text-black font-bold' : 'bg-white/5 hover:bg-white/10'}`}>{g.name}</button>
                ))}
                {isSeriesSection && getUniqueGenres(seriesItems).map((genreOption) => (
                  <button key={genreOption} onClick={() => setSeriesGenreFilter((current) => current === genreOption ? null : genreOption)} className={`p-3 rounded-xl text-right transition-all text-sm w-full ${seriesGenreFilter === genreOption ? 'bg-[#00ffcc] text-black font-bold' : 'bg-white/5 hover:bg-white/10'}`}>{genreOption}</button>
                ))}
              </div>
               <div className="hidden">
               {/* Special categories */}
               {['סדרות 📺', 'מועדפים ♥', 'צפיות אחרונות 🕓'].map(g => {
                 const key = g.split(' ')[0];
                 return (
                   <button key={g} onClick={() => { setGenre(key === 'סדרות' ? 'סדרות' : key === 'מועדפים' ? 'מועדפים' : 'צפיות אחרונות'); setActiveGenreId(null); setNavContext(null); }} className={`p-3 rounded-xl text-right transition-all text-sm ${(genre === (key === 'סדרות' ? 'סדרות' : key === 'מועדפים' ? 'מועדפים' : 'צפיות אחרונות') && !navContext) ? 'bg-[#00ffcc] text-black font-bold' : 'bg-white/5 hover:bg-white/10'}`}>
                     {g}{g.startsWith('מועדפים') ? ` (${favorites.length})` : g.startsWith('צפיות') ? ` (${watchHistory.length})` : ''}
                   </button>
                 );
               })}
               <div className="border-t border-white/10 my-2" />
               <p className="text-xs text-gray-500 px-1">סגנות סרטים</p>
               {/* Genre list from TMDB */}
               {(genreList.length > 0 ? genreList : [{ id: 0, name: 'הכל', tmdbId: null }]).map((g: any) => (
                 <button key={g.id} onClick={() => { setActiveGenreId(g.tmdbId); setGenre('הכל'); setNavContext(null); }} className={`p-3 rounded-xl text-right transition-all text-sm ${activeGenreId === g.tmdbId && !navContext && genre !== 'סדרות' && genre !== 'מועדפים' && genre !== 'צפיות אחרונות' ? 'bg-[#00ffcc] text-black font-bold' : 'bg-white/5 hover:bg-white/10'}`}>{g.name}</button>
               ))}
               </div>
               <button onClick={() => setShowSettings(true)} className="p-3 rounded-xl text-right transition-all bg-white/5 mt-2 text-gray-400 hover:text-white border border-white/5 text-sm">⚙️ הגדרות</button>
            </div>
            {fetchError && (
              <div className="mt-auto p-4 bg-red-900/50 border border-red-500 rounded-xl text-red-200 text-sm">
                <p className="font-bold mb-1">שגיאת רשת במשיכת סרטים:</p>
                <p>{fetchError}</p>
                <p className="mt-2 text-xs">האם שרת ה-Node פועל במחשב (npm run dev)?</p>
              </div>
            )}
          </div>
          <div className="flex-1 flex flex-col items-center justify-center text-[#00ffcc] animate-pulse text-2xl">
            לחץ OK להתחלה
            {fetchError && <span className="text-red-400 text-lg mt-4 text-center max-w-lg bg-black/50 p-2 rounded">מציג סרטי גיבוי בלבד בשל שגיאת רשת</span>}
          </div>
        </div>
      )}

      <AnimatePresence>
        {showSettings && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-50 bg-black/95 flex flex-col items-center justify-center p-8 backdrop-blur-md">
            <div className="bg-[#0a0a0a] border border-[#00ffcc]/40 rounded-[40px] p-12 flex flex-col items-center max-w-xl w-full shadow-2xl">
              <h2 className="text-4xl font-bold text-[#00ffcc] mb-8">הגדרות</h2>
              
              {otaVersion && (
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

              <div className="w-full bg-white/5 border border-white/10 rounded-2xl p-6 mb-8 flex items-center justify-between gap-4">
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

              <div className="w-full bg-white/5 border border-white/10 rounded-2xl p-6 mb-8 flex flex-col gap-6">
                {!otaVersion && (
                  <button onClick={() => {
                    fetch(buildApiUrl(normalizedApiBase, '/api/version'))
                      .then(res => res.json())
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
                <div className="flex items-center justify-between border-t border-white/10 pt-6 mt-2">
                  <div>
                    <p className="text-gray-400 text-sm mb-1">חיבור טלגרם למכשיר זה</p>
                    <p className="text-2xl font-bold">{tgStatus === 'loggedIn' ? 'מחובר ✔️' : 'מנותק ❌'}</p>
                  </div>
                  {tgStatus === 'loggedIn' ? (
                    <button onClick={() => {
                       const base = apiBase.replace(/\/$/, '');
                       const sessionStr = localStorage.getItem('tg_session') || '';
                       fetchApiJson(`${base}/api/tg/logout`, { method: 'POST', headers: { 'x-tg-session': sessionStr } })
                         .then(() => { localStorage.removeItem('tg_session'); setTgStatus('loggedOut'); });
                    }} className="px-6 py-3 bg-red-500/20 text-red-400 border border-red-500/50 rounded-xl hover:bg-red-500 hover:text-white transition-colors">התנתק מהמכשיר</button>
                  ) : (
                    <button onClick={() => { setShowSettings(false); setTgStatus('phoneInput'); }} className="px-6 py-3 bg-[#2AABEE]/20 text-[#2AABEE] border border-[#2AABEE]/50 rounded-xl hover:bg-[#2AABEE] hover:text-white transition-colors">התחבר עכשיו</button>
                  )}
                </div>
              </div>

              <button onClick={() => setShowSettings(false)} className="px-10 py-4 bg-white/10 hover:bg-white/20 rounded-2xl transition-colors w-full text-xl font-bold">סגור</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {otaVersion && !showSettings && !showCinemaScreen && !selectedMovie && !isLocked && (
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="absolute top-8 left-8 z-50">
            <button onClick={() => setShowSettings(true)} className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-4 rounded-full font-bold shadow-[0_0_20px_rgba(37,99,235,0.8)] flex items-center gap-3 transition-colors text-lg border border-blue-400/50">
              <span className="text-2xl">🔔</span>
              עדכון מערכת זמין!
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showCinemaScreen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 z-40 bg-black p-8 flex flex-col">
            <div className="flex justify-between items-center mb-8 border-b border-white/10 pb-4">
              <h2 className="text-3xl font-bold text-blue-400">תוצאות מטלגרם: {selectedMovie?.title}</h2>
              <button onClick={() => setShowCinemaScreen(false)}><X /></button>
            </div>
            {isBuffering ? (
              <div className="flex-1 flex flex-col items-center justify-center">
                <Loader2 className="animate-spin w-20 h-20 text-blue-500 mb-6" />
                <p className="text-2xl mb-8">מכין זרם נתונים (50MB Buffer)...</p>
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
               onTimeUpdate={handleVideoTimeUpdate}
               onPause={handleVideoTimeUpdate}
               onEnded={handleVideoEnded}
            >
               {activeMedia.subtitleUrl && (
                 <track kind="subtitles" src={activeMedia.subtitleUrl} srcLang="he" label="Hebrew" default />
               )}
            </video>
            <button onClick={closePlayer} className="absolute top-8 left-8 z-[110] bg-black/50 p-4 rounded-full text-white hover:bg-white/20 transition-all font-bold">
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
                         onClick={() => upsertMediaState(selectedMovie, (entry) => ({ ...entry, snapshot: { ...entry.snapshot, ...selectedMovie }, favorite: !entry.favorite }))}
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
