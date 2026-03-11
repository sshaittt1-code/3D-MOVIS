import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, PointerLockControls, SpotLight, Text } from '@react-three/drei';
import * as THREE from 'three';
import { AnimatePresence, motion } from 'framer-motion';
import { Film, Heart, Loader2, Lock, Play, Search, Shuffle, Star, TrendingUp, X } from 'lucide-react';

const GENRES = ['הכל', 'ישראלי', 'פעולה', 'מתח', 'מועדפים'] as const;
const SORT_OPTIONS = [
  { value: 'popularity', label: 'פופולריות', icon: TrendingUp },
  { value: 'rating', label: 'דירוג', icon: Star },
  { value: 'name', label: 'שם', icon: Shuffle },
] as const;

type SortValue = (typeof SORT_OPTIONS)[number]['value'];

const usePlayerControls = (
  isTvMode: boolean,
  isLocked: boolean,
  setSelectedMovie: (movie: any) => void,
  displayMovies: any[],
  corridorZ: number,
  setCorridorZ: React.Dispatch<React.SetStateAction<number>>,
  lookDirection: 'left' | 'right' | 'forward',
  setLookDirection: React.Dispatch<React.SetStateAction<'left' | 'right' | 'forward'>>,
) => {
  const [movement, setMovement] = useState({
    forward: false,
    backward: false,
    left: false,
    right: false,
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          if (!isTvMode) setMovement((m) => ({ ...m, forward: true }));
          break;
        case 'KeyS':
        case 'ArrowDown':
          if (!isTvMode) setMovement((m) => ({ ...m, backward: true }));
          break;
        case 'KeyA':
        case 'ArrowLeft':
          if (!isTvMode) setMovement((m) => ({ ...m, left: true }));
          break;
        case 'KeyD':
        case 'ArrowRight':
          if (!isTvMode) setMovement((m) => ({ ...m, right: true }));
          break;
      }

      if (isTvMode && isLocked) {
        if (e.key === 'ArrowUp') {
          setCorridorZ((z) => Math.min(z + 1, Math.floor(displayMovies.length / 2) - 1));
          setLookDirection('forward');
        } else if (e.key === 'ArrowDown') {
          setCorridorZ((z) => Math.max(z - 1, 0));
          setLookDirection('forward');
        } else if (e.key === 'ArrowLeft') {
          setLookDirection('left');
        } else if (e.key === 'ArrowRight') {
          setLookDirection('right');
        } else if (e.key === 'Enter' || e.key === 'Select' || e.keyCode === 23) {
          if (lookDirection === 'left' || lookDirection === 'right') {
            const index = corridorZ * 2 + (lookDirection === 'left' ? 0 : 1);
            const movie = displayMovies[index];
            if (movie) {
              setSelectedMovie(movie);
            }
          }
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          setMovement((m) => ({ ...m, forward: false }));
          break;
        case 'KeyS':
        case 'ArrowDown':
          setMovement((m) => ({ ...m, backward: false }));
          break;
        case 'KeyA':
        case 'ArrowLeft':
          setMovement((m) => ({ ...m, left: false }));
          break;
        case 'KeyD':
        case 'ArrowRight':
          setMovement((m) => ({ ...m, right: false }));
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
    };
  }, [corridorZ, displayMovies, isLocked, isTvMode, lookDirection, setCorridorZ, setLookDirection, setSelectedMovie]);

  return movement;
};

const Player = ({
  corridorLength,
  movies,
  isTvMode,
  isLocked,
  corridorZ,
  setCorridorZ,
  lookDirection,
  setLookDirection,
  setSelectedMovie,
}: any) => {
  const { forward, backward, left, right } = usePlayerControls(
    isTvMode,
    isLocked,
    setSelectedMovie,
    movies,
    corridorZ,
    setCorridorZ,
    lookDirection,
    setLookDirection,
  );
  const { camera } = useThree();
  const speed = 8;
  const direction = new THREE.Vector3();
  const frontVector = new THREE.Vector3();
  const sideVector = new THREE.Vector3();

  useFrame((_, delta) => {
    if (!isTvMode) {
      frontVector.set(0, 0, Number(backward) - Number(forward));
      sideVector.set(Number(left) - Number(right), 0, 0);
      direction.subVectors(frontVector, sideVector).normalize().multiplyScalar(speed * delta);

      camera.translateX(direction.x);
      camera.translateZ(direction.z);
      camera.position.y = 1.6;

      if (camera.position.x > 3.5) camera.position.x = 3.5;
      if (camera.position.x < -3.5) camera.position.x = -3.5;
      if (camera.position.z > 5) camera.position.z = 5;
      if (camera.position.z < -corridorLength + 5) camera.position.z = -corridorLength + 5;
    } else if (isLocked) {
      const targetZ = -corridorZ * 5 + 3;
      camera.position.z = THREE.MathUtils.lerp(camera.position.z, targetZ, 0.1);
      camera.position.x = THREE.MathUtils.lerp(camera.position.x, 0, 0.1);
      camera.position.y = 1.6;

      let targetRotY = 0;
      if (lookDirection === 'left') targetRotY = Math.PI / 2;
      if (lookDirection === 'right') targetRotY = -Math.PI / 2;

      const targetQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, targetRotY, 0));
      camera.quaternion.slerp(targetQuat, 0.1);
    }
  });

  return null;
};

const Poster = ({ movie, position, rotation, onClick, isFocused }: any) => {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  const [hovered, setHovered] = useState(false);
  const groupRef = useRef<THREE.Group | null>(null);

  useEffect(() => {
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    loader.load(movie.poster, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      setTexture(tex);
    });
  }, [movie.poster]);

  useFrame(() => {
    if (groupRef.current) {
      const targetScale = isFocused ? 1.16 : hovered ? 1.08 : 1;
      groupRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, 1), 0.08);
    }
  });

  return (
    <group position={position} rotation={rotation} ref={groupRef}>
      <mesh onPointerOver={() => setHovered(true)} onPointerOut={() => setHovered(false)} onClick={() => onClick(movie)}>
        <planeGeometry args={[2.5, 3.75]} />
        {texture ? (
          <meshStandardMaterial
            map={texture}
            color={hovered || isFocused ? '#ffffff' : '#c9d0d5'}
            roughness={0.22}
            metalness={0.12}
          />
        ) : (
          <meshStandardMaterial color={hovered || isFocused ? '#505866' : '#182028'} roughness={0.3} metalness={0.1} />
        )}
      </mesh>

      <mesh position={[0, 0, -0.02]}>
        <planeGeometry args={[2.68, 3.93]} />
        <meshBasicMaterial color={hovered || isFocused ? '#8fffe7' : '#0d1118'} />
      </mesh>

      <Text
        position={[0, -2.12, 0]}
        fontSize={0.24}
        color={hovered || isFocused ? '#8fffe7' : '#95a3af'}
        maxWidth={2.8}
        textAlign="center"
      >
        {movie.title}
      </Text>

      {(hovered || isFocused) && <SpotLight position={[0, 2.2, 2]} angle={0.46} penumbra={0.55} intensity={2.2} color="#8fffe7" />}
    </group>
  );
};

const Corridor = ({ movies, onPosterClick, isTvMode, isLocked, corridorZ, lookDirection }: any) => {
  const length = (movies.length / 2) * 5 + 10;

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -length / 2 + 5]}>
        <planeGeometry args={[12, length]} />
        <meshStandardMaterial color="#04070b" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, -length / 2 + 5]}>
        <planeGeometry args={[4, length]} />
        <meshStandardMaterial color="#10212f" emissive="#0a1a25" emissiveIntensity={0.8} />
      </mesh>
      <gridHelper args={[12, length, '#8fffe7', '#123245']} position={[0, 0.01, -length / 2 + 5]} />

      {movies.map((movie: any, index: number) => {
        const isLeft = index % 2 === 0;
        const zPos = -Math.floor(index / 2) * 5 - 2;
        const isFocused =
          isTvMode &&
          isLocked &&
          Math.floor(index / 2) === corridorZ &&
          ((isLeft && lookDirection === 'left') || (!isLeft && lookDirection === 'right'));

        return (
          <Poster
            key={movie.uniqueId}
            movie={movie}
            position={[isLeft ? -4.9 : 4.9, 2.2, zPos]}
            rotation={[0, isLeft ? Math.PI / 2 : -Math.PI / 2, 0]}
            onClick={onPosterClick}
            isFocused={isFocused}
          />
        );
      })}
    </group>
  );
};

const formatPopularity = (value?: number) => {
  if (typeof value !== 'number') return 'חדש';
  return `${Math.round(value)}% עניין`;
};

export default function App() {
  const [baseMovies, setBaseMovies] = useState<any[]>([]);
  const [selectedMovie, setSelectedMovie] = useState<any>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [isTvMode, setIsTvMode] = useState(false);
  const [corridorZ, setCorridorZ] = useState(0);
  const [lookDirection, setLookDirection] = useState<'left' | 'right' | 'forward'>('forward');
  const [favorites, setFavorites] = useState<number[]>([]);
  const [genre, setGenre] = useState<(typeof GENRES)[number]>('הכל');
  const [sortBy, setSortBy] = useState<SortValue>('popularity');
  const [showCinemaScreen, setShowCinemaScreen] = useState(false);
  const [isSearchingTg, setIsSearchingTg] = useState(false);
  const [tgSearchResults, setTgSearchResults] = useState<any[]>([]);
  const [tgVideoUrl, setTgVideoUrl] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/movies')
      .then((res) => res.json())
      .then((data) => setBaseMovies(data.movies || []));
  }, []);

  const displayMovies = useMemo(() => {
    let filtered = baseMovies;
    if (genre === 'מועדפים') {
      filtered = baseMovies.filter((m) => favorites.includes(m.id));
    } else if (genre !== 'הכל') {
      filtered = baseMovies.filter((m) => m.genre === genre);
    }

    const sorted = [...filtered];
    if (sortBy === 'rating') sorted.sort((a, b) => b.rating - a.rating);
    else if (sortBy === 'popularity') sorted.sort((a, b) => b.popularity - a.popularity);
    else sorted.sort((a, b) => String(a.title).localeCompare(String(b.title), 'he'));

    return Array(5)
      .fill(sorted)
      .flat()
      .map((m, i) => ({ ...m, uniqueId: `${m.id}-${i}` }));
  }, [baseMovies, favorites, genre, sortBy]);

  useEffect(() => {
    const handleGlobalKey = (e: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Escape', 'Backspace'].includes(e.key)) {
        setIsTvMode(true);
      }

      if (e.key === 'Escape' || e.key === 'Backspace' || e.keyCode === 4) {
        if (tgVideoUrl) setTgVideoUrl(null);
        else if (showCinemaScreen) setShowCinemaScreen(false);
        else if (selectedMovie) setSelectedMovie(null);
        else if (isLocked) setIsLocked(false);

        if (tgVideoUrl || showCinemaScreen || selectedMovie || isLocked) {
          e.preventDefault();
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKey);
    return () => window.removeEventListener('keydown', handleGlobalKey);
  }, [isLocked, selectedMovie, showCinemaScreen, tgVideoUrl]);

  useEffect(() => {
    setCorridorZ(0);
    setLookDirection('forward');
  }, [genre, sortBy]);

  const toggleFavorite = (movieId: number) => {
    setFavorites((current) => (current.includes(movieId) ? current.filter((id) => id !== movieId) : [...current, movieId]));
  };

  const handleTelegramSearch = async () => {
    if (!selectedMovie) return;

    setIsSearchingTg(true);
    setShowCinemaScreen(true);
    try {
      const res = await fetch(`/api/tg/search?query=${encodeURIComponent(selectedMovie.title)}`);
      const data = await res.json();
      setTgSearchResults(data.results || []);
    } finally {
      setIsSearchingTg(false);
    }
  };

  return (
    <div className="app-shell relative h-screen w-full overflow-hidden text-white" dir="rtl">
      <div className="pointer-events-none absolute inset-0 z-10 bg-[radial-gradient(circle_at_top,_rgba(143,255,231,0.15),_transparent_35%),linear-gradient(180deg,_rgba(3,6,10,0.15)_0%,_rgba(3,6,10,0.92)_100%)]" />

      <Canvas camera={{ position: [0, 1.6, 2], fov: 75 }}>
        <Suspense fallback={null}>
          <fog attach="fog" args={['#020508', 4, 38]} />
          <ambientLight intensity={0.55} />
          <pointLight position={[0, 6, 2]} intensity={10} color="#76ffe8" />
          <Corridor
            movies={displayMovies}
            isTvMode={isTvMode}
            isLocked={isLocked}
            corridorZ={corridorZ}
            lookDirection={lookDirection}
            onPosterClick={setSelectedMovie}
          />
          <Player
            movies={displayMovies}
            isTvMode={isTvMode}
            isLocked={isLocked}
            corridorZ={corridorZ}
            setCorridorZ={setCorridorZ}
            lookDirection={lookDirection}
            setLookDirection={setLookDirection}
            setSelectedMovie={setSelectedMovie}
            corridorLength={(displayMovies.length / 2) * 5 + 10}
          />
          <Environment preset="night" />
        </Suspense>
        {!isTvMode && <PointerLockControls onLock={() => setIsLocked(true)} onUnlock={() => setIsLocked(false)} />}
      </Canvas>

      {!isLocked && !selectedMovie && (
        <div className="absolute inset-0 z-20 flex bg-black/28 backdrop-blur-[6px]">
          <aside className="glass-panel relative flex h-full w-[360px] flex-col border-l border-white/10 p-8">
            <div className="absolute inset-x-6 top-6 h-28 rounded-full bg-[radial-gradient(circle,_rgba(143,255,231,0.16),_transparent_65%)] blur-2xl" />
            <div className="relative">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">
                <Lock size={14} />
                חוויית קולנוע ל-Android TV
              </div>
              <h1 className="mb-2 flex items-center gap-3 text-3xl font-semibold tracking-tight text-[#8fffe7]">
                <Film />
                HoloCinema TV
              </h1>
              <p className="max-w-xs text-sm leading-6 text-slate-300">
                ניווט מהיר עם שלט, גלריה תלת-ממדית, וחיפוש צפייה ישיר בטלגרם מתוך חוויית מסך מלאה.
              </p>
            </div>

            <div className="relative mt-8 space-y-3">
              <button
                onClick={() => setIsLocked(true)}
                className="w-full rounded-2xl bg-[#8fffe7] px-5 py-4 text-base font-semibold text-slate-950 shadow-[0_14px_40px_rgba(143,255,231,0.25)] transition hover:brightness-105 focus:ring-4 focus:ring-[#8fffe7]/50"
              >
                כניסה למסדרון
              </button>
              <div className="grid grid-cols-2 gap-3 text-sm text-slate-200">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs text-white/50">סרטים זמינים</p>
                  <p className="mt-1 text-2xl font-semibold">{baseMovies.length}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs text-white/50">מועדפים</p>
                  <p className="mt-1 text-2xl font-semibold">{favorites.length}</p>
                </div>
              </div>
            </div>

            <div className="relative mt-8">
              <p className="mb-3 text-xs font-medium uppercase tracking-[0.28em] text-[#8fffe7]/80">ז׳אנרים</p>
              <div className="flex flex-col gap-3">
                {GENRES.map((item) => (
                  <button
                    key={item}
                    onClick={() => setGenre(item)}
                    className={`rounded-2xl border px-4 py-3 text-right transition focus:ring-4 focus:ring-[#8fffe7]/35 ${
                      genre === item
                        ? 'border-[#8fffe7]/50 bg-[#8fffe7] text-slate-950'
                        : 'border-white/10 bg-white/5 text-slate-100 hover:bg-white/10'
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>

            <div className="relative mt-8">
              <p className="mb-3 text-xs font-medium uppercase tracking-[0.28em] text-[#8fffe7]/80">מיון</p>
              <div className="grid grid-cols-3 gap-2">
                {SORT_OPTIONS.map((option) => {
                  const Icon = option.icon;
                  const isActive = sortBy === option.value;
                  return (
                    <button
                      key={option.value}
                      onClick={() => setSortBy(option.value)}
                      className={`flex flex-col items-center gap-2 rounded-2xl border px-3 py-3 text-xs transition ${
                        isActive
                          ? 'border-[#8fffe7]/45 bg-[#8fffe7]/12 text-[#8fffe7]'
                          : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
                      }`}
                    >
                      <Icon size={16} />
                      <span>{option.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="relative mt-auto rounded-3xl border border-white/10 bg-black/20 p-5 text-sm text-slate-300">
              <p className="mb-2 font-semibold text-white">שליטה מהירה</p>
              <p>למעלה ולמטה לזוז במסדרון, ימינה ושמאלה להתמקד בפוסטר, ו־OK לפתיחת פרטי הסרט.</p>
            </div>
          </aside>

          <div className="relative flex flex-1 items-center justify-center px-10" onClick={() => setIsLocked(true)}>
            <div className="glass-panel max-w-2xl rounded-[32px] px-10 py-8 text-center">
              <p className="mb-3 text-sm uppercase tracking-[0.35em] text-[#8fffe7]/75">Cinematic Mode</p>
              <h2 className="text-4xl font-semibold leading-tight text-white">גלול בין הפוסטרים ופתח צפייה במסך גדול</h2>
              <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-slate-300">
                החוויה בנויה לשלט Android TV, אבל עובדת גם עם מקלדת ועכבר בזמן פיתוח.
              </p>
              <div className="mt-8 inline-flex animate-pulse rounded-full border border-[#8fffe7]/30 bg-[#8fffe7]/10 px-6 py-3 text-sm text-[#8fffe7]">
                לחץ OK או Enter כדי להתחיל
              </div>
            </div>
          </div>
        </div>
      )}

      <AnimatePresence>
        {selectedMovie && !showCinemaScreen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            className="absolute inset-0 z-30 flex items-center justify-center bg-black/84 p-6 backdrop-blur-md"
          >
            <div className="glass-panel flex max-h-[88vh] w-full max-w-6xl overflow-hidden rounded-[36px] border border-white/10">
              <div className="relative w-full max-w-[340px] bg-slate-900">
                <img src={selectedMovie.poster} className="h-full w-full object-cover" alt={selectedMovie.title} />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/50 to-transparent p-5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="rounded-full bg-white/10 px-3 py-1">{selectedMovie.genre || 'סרט'}</span>
                    <span className="rounded-full bg-[#8fffe7]/15 px-3 py-1 text-[#8fffe7]">{formatPopularity(selectedMovie.popularity)}</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-1 flex-col p-8 md:p-10">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="mb-2 text-sm uppercase tracking-[0.32em] text-[#8fffe7]/75">Movie Preview</p>
                    <h2 className="text-4xl font-semibold leading-tight text-white">{selectedMovie.title}</h2>
                  </div>
                  <button
                    onClick={() => setSelectedMovie(null)}
                    className="rounded-full border border-white/10 bg-white/5 p-3 text-slate-200 transition hover:bg-white/10"
                  >
                    <X />
                  </button>
                </div>

                <div className="mt-6 flex flex-wrap gap-3 text-sm">
                  <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-slate-200">
                    <Star className="ml-2 inline" size={15} />
                    {selectedMovie.rating ? `${selectedMovie.rating}/10` : 'ללא דירוג'}
                  </div>
                  <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-slate-200">
                    <TrendingUp className="ml-2 inline" size={15} />
                    {formatPopularity(selectedMovie.popularity)}
                  </div>
                </div>

                <p className="mt-6 max-w-3xl text-lg leading-8 text-slate-300">{selectedMovie.desc || 'אין תיאור זמין כרגע.'}</p>

                <div className="mt-auto flex flex-wrap gap-4 pt-8">
                  <button
                    onClick={handleTelegramSearch}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[#2AABEE] px-6 py-4 text-base font-semibold text-white shadow-[0_12px_34px_rgba(42,171,238,0.28)] transition hover:brightness-105"
                  >
                    <Play size={18} fill="currentColor" />
                    חפש צפייה בטלגרם
                  </button>
                  <button
                    onClick={() => toggleFavorite(selectedMovie.id)}
                    className={`inline-flex items-center justify-center gap-2 rounded-2xl border px-6 py-4 text-base font-semibold transition ${
                      favorites.includes(selectedMovie.id)
                        ? 'border-rose-400/50 bg-rose-400/12 text-rose-200'
                        : 'border-white/10 bg-white/5 text-slate-200 hover:bg-white/10'
                    }`}
                  >
                    <Heart size={18} fill={favorites.includes(selectedMovie.id) ? 'currentColor' : 'none'} />
                    {favorites.includes(selectedMovie.id) ? 'הסר ממועדפים' : 'שמור למועדפים'}
                  </button>
                  <button
                    onClick={() => setSelectedMovie(null)}
                    className="rounded-2xl border border-white/10 bg-white/5 px-6 py-4 text-base font-semibold text-slate-200 transition hover:bg-white/10"
                  >
                    חזרה
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showCinemaScreen && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute inset-0 z-40 flex flex-col bg-[#02060b]/96 p-6 md:p-8"
          >
            <div className="mb-6 flex items-center justify-between gap-4">
              <div>
                <p className="mb-2 text-sm uppercase tracking-[0.32em] text-[#2AABEE]/75">Telegram Search</p>
                <h2 className="text-3xl font-semibold text-white">תוצאות עבור {selectedMovie?.title}</h2>
              </div>
              <button
                onClick={() => setShowCinemaScreen(false)}
                className="rounded-full border border-white/10 bg-white/5 p-3 text-slate-100 transition hover:bg-white/10"
              >
                <X />
              </button>
            </div>

            <div className="glass-panel mb-6 flex items-center gap-3 rounded-3xl px-5 py-4 text-slate-300">
              <Search size={18} className="text-[#2AABEE]" />
              <span>בחר תוצאה כדי לפתוח סטרים ישירות מתוך האפליקציה.</span>
            </div>

            <div className="flex-1 overflow-y-auto">
              {isSearchingTg ? (
                <div className="flex h-full min-h-[300px] items-center justify-center">
                  <div className="glass-panel flex items-center gap-4 rounded-3xl px-8 py-6 text-lg text-white">
                    <Loader2 className="animate-spin text-[#2AABEE]" size={26} />
                    מחפש תוצאות בטלגרם...
                  </div>
                </div>
              ) : tgSearchResults.length === 0 ? (
                <div className="glass-panel flex min-h-[300px] flex-col items-center justify-center rounded-[32px] px-8 py-10 text-center">
                  <p className="text-2xl font-semibold text-white">לא נמצאו תוצאות עדיין</p>
                  <p className="mt-3 max-w-xl text-slate-400">נסה סרט אחר, או ודא שהחיפוש בשרת מחזיר תוצאות עבור שם הסרט שבחרת.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {tgSearchResults.map((res, i) => (
                    <button
                      key={i}
                      onClick={() => setTgVideoUrl(`/api/tg/stream/${res.peerId}/${res.id}`)}
                      className="group glass-panel flex items-center gap-4 rounded-[28px] border border-white/10 p-5 text-right transition hover:border-[#2AABEE]/45 hover:bg-[#2AABEE]/[0.08] focus:ring-4 focus:ring-[#2AABEE]/30"
                    >
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#2AABEE]/15 text-[#8dcfff] transition group-hover:bg-[#2AABEE] group-hover:text-white">
                        <Play size={22} fill="currentColor" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate text-lg font-semibold text-white" dir="ltr">
                          {res.title}
                        </h3>
                        <p className="mt-1 text-sm text-slate-400">{res.size} | {res.chatName}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {tgVideoUrl && (
              <div className="absolute inset-0 z-50 bg-black">
                <video src={tgVideoUrl} controls autoPlay className="h-full w-full" />
                <button
                  onClick={() => setTgVideoUrl(null)}
                  className="absolute right-6 top-6 rounded-2xl border border-white/10 bg-black/65 px-5 py-3 text-sm text-white backdrop-blur"
                >
                  חזרה לתוצאות
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
