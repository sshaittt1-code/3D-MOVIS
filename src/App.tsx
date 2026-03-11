import React, { useState, useEffect, useRef, Suspense, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PointerLockControls, Text, Environment, SpotLight } from '@react-three/drei';
import * as THREE from 'three';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Play, Info, Star, TrendingUp, Type, Film, Heart, Shuffle, Search, Phone, Key, Lock, Loader2 } from 'lucide-react';

// Player Movement Hook with TV Remote Support
const usePlayerControls = (isTvMode: boolean, isLocked: boolean, setSelectedMovie: any, displayMovies: any[], corridorZ: number, setCorridorZ: any, lookDirection: string, setLookDirection: any) => {
  const [movement, setMovement] = useState({
    forward: false,
    backward: false,
    left: false,
    right: false,
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Standard Keyboard Controls (W,A,S,D + Arrows)
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

      // Android TV Remote / D-Pad Logic
      if (isTvMode && isLocked) {
        if (e.key === 'ArrowUp') {
          // Move forward in the corridor
          setCorridorZ((z: number) => Math.min(z + 1, Math.floor(displayMovies.length / 2) - 1));
          setLookDirection('forward');
        } else if (e.key === 'ArrowDown') {
          // Move backward in the corridor
          setCorridorZ((z: number) => Math.max(z - 1, 0));
          setLookDirection('forward');
        } else if (e.key === 'ArrowLeft') {
          // Look at left poster
          setLookDirection('left');
        } else if (e.key === 'ArrowRight') {
          // Look at right poster
          setLookDirection('right');
        } else if (e.key === 'Enter' || e.key === 'Select' || e.keyCode === 23) {
          // OK button - Select movie if looking at it
          if (lookDirection === 'left' || lookDirection === 'right') {
            const isLookingLeft = lookDirection === 'left';
            const index = corridorZ * 2 + (isLookingLeft ? 0 : 1);
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
        case 'ArrowUp': setMovement((m) => ({ ...m, forward: false })); break;
        case 'KeyS':
        case 'ArrowDown': setMovement((m) => ({ ...m, backward: false })); break;
        case 'KeyA':
        case 'ArrowLeft': setMovement((m) => ({ ...m, left: false })); break;
        case 'KeyD':
        case 'ArrowRight': setMovement((m) => ({ ...m, right: false })); break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
    };
  }, [isTvMode, isLocked, displayMovies, corridorZ, lookDirection, setCorridorZ, setLookDirection, setSelectedMovie]);

  return movement;
};

const Player = ({ corridorLength, movies, isTvMode, isLocked, corridorZ, setCorridorZ, lookDirection, setLookDirection, setSelectedMovie }: any) => {
  const { forward, backward, left, right } = usePlayerControls(isTvMode, isLocked, setSelectedMovie, movies, corridorZ, setCorridorZ, lookDirection, setLookDirection);
  const { camera } = useThree();
  const speed = 8;
  const direction = new THREE.Vector3();
  const frontVector = new THREE.Vector3();
  const sideVector = new THREE.Vector3();

  // Handle Free Roam Movement (PC Mode)
  useFrame((state, delta) => {
    if (!isTvMode) {
      frontVector.set(0, 0, Number(backward) - Number(forward));
      sideVector.set(Number(left) - Number(right), 0, 0);
      direction.subVectors(frontVector, sideVector).normalize().multiplyScalar(speed * delta);

      camera.translateX(direction.x);
      camera.translateZ(direction.z);
      camera.position.y = 1.6;

      // Constraints
      if (camera.position.x > 3.5) camera.position.x = 3.5;
      if (camera.position.x < -3.5) camera.position.x = -3.5;
      if (camera.position.z > 5) camera.position.z = 5;
      if (camera.position.z < -corridorLength + 5) camera.position.z = -corridorLength + 5;
    } else if (isLocked) {
      // TV Mode Smooth Transition to focused spot
      const targetZ = -corridorZ * 5 + 3;
      const targetX = 0;

      camera.position.z = THREE.MathUtils.lerp(camera.position.z, targetZ, 0.1);
      camera.position.x = THREE.MathUtils.lerp(camera.position.x, targetX, 0.1);
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

const Poster = ({ movie, position, rotation, onClick, setHoveredPoster, isFavorite, onToggleFavorite, isFocused }: any) => {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  const [hovered, setHovered] = useState(false);
  const groupRef = useRef<any>();

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
      const targetScale = isFocused ? 1.2 : 1;
      groupRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, 1), 0.1);
    }
  });

  return (
    <group position={position} rotation={rotation} ref={groupRef}>
      <mesh
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
        onClick={() => onClick(movie)}
      >
        <planeGeometry args={[2.5, 3.75]} />
        {texture ? (
          <meshStandardMaterial map={texture} color={(hovered || isFocused) ? '#ffffff' : '#cccccc'} roughness={0.2} metalness={0.1} />
        ) : (
          <meshStandardMaterial color={(hovered || isFocused) ? '#444444' : '#222222'} roughness={0.2} metalness={0.1} />
        )}
      </mesh>

      <mesh position={[0, 0, -0.02]}>
        <planeGeometry args={[2.6, 3.85]} />
        <meshBasicMaterial color={(hovered || isFocused) ? '#00ffcc' : '#111111'} />
      </mesh>

      <Text position={[0, -2.1, 0]} fontSize={0.25} color={(hovered || isFocused) ? '#00ffcc' : '#888888'}>
        {movie.title}
      </Text>

      {(hovered || isFocused) && (
        <SpotLight position={[0, 2, 2]} angle={0.5} penumbra={0.5} intensity={2} color="#00ffcc" />
      )}
    </group>
  );
};

const Corridor = ({ movies, onPosterClick, setHoveredPoster, favorites, onToggleFavorite, isTvMode, isLocked, corridorZ, lookDirection }: any) => {
  const length = (movies.length / 2) * 5 + 10;

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -length / 2 + 5]}>
        <planeGeometry args={[10, length]} />
        <meshStandardMaterial color="#050505" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, -length / 2 + 5]}>
        <planeGeometry args={[3, length]} />
        <meshStandardMaterial color="#001122" />
      </mesh>
      <gridHelper args={[10, length, '#00ffcc', '#003322']} position={[0, 0.01, -length / 2 + 5]} />

      {movies.map((movie: any, index: number) => {
        const isLeft = index % 2 === 0;
        const zPos = -Math.floor(index / 2) * 5 - 2;
        const isFocused = isTvMode && isLocked && Math.floor(index / 2) === corridorZ && ((isLeft && lookDirection === 'left') || (!isLeft && lookDirection === 'right'));
        return (
          <Poster
            key={movie.uniqueId}
            movie={movie}
            position={[isLeft ? -4.9 : 4.9, 2.2, zPos]}
            rotation={[0, isLeft ? Math.PI / 2 : -Math.PI / 2, 0]}
            onClick={onPosterClick}
            setHoveredPoster={setHoveredPoster}
            isFavorite={favorites.includes(movie.id)}
            onToggleFavorite={onToggleFavorite}
            isFocused={isFocused}
          />
        );
      })}
    </group>
  );
};

export default function App() {
  const [baseMovies, setBaseMovies] = useState<any[]>([]);
  const [selectedMovie, setSelectedMovie] = useState<any>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [hoveredPoster, setHoveredPoster] = useState<any>(null);
  const [isTvMode, setIsTvMode] = useState(false);
  const [corridorZ, setCorridorZ] = useState(0);
  const [lookDirection, setLookDirection] = useState<'left' | 'right' | 'forward'>('forward');
  const [favorites, setFavorites] = useState<number[]>([]);
  const [genre, setGenre] = useState('הכל');
  const [sortBy, setSortBy] = useState<'popularity' | 'rating' | 'name'>('popularity');
  const [showTgLogin, setShowTgLogin] = useState(false);
  const [showCinemaScreen, setShowCinemaScreen] = useState(false);
  const [isSearchingTg, setIsSearchingTg] = useState(false);
  const [tgSearchResults, setTgSearchResults] = useState<any[]>([]);
  const [tgVideoUrl, setTgVideoUrl] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/movies').then(res => res.json()).then(data => setBaseMovies(data.movies || []));
  }, []);

  const displayMovies = useMemo(() => {
    let filtered = baseMovies;
    if (genre === 'מועדפים') filtered = baseMovies.filter(m => favorites.includes(m.id));
    else if (genre !== 'הכל') filtered = baseMovies.filter(m => m.genre === genre);

    let sorted = [...filtered];
    if (sortBy === 'rating') sorted.sort((a, b) => b.rating - a.rating);
    else if (sortBy === 'popularity') sorted.sort((a, b) => b.popularity - a.popularity);

    return Array(5).fill(sorted).flat().map((m, i) => ({ ...m, uniqueId: `${m.id}-${i}` }));
  }, [baseMovies, genre, favorites, sortBy]);

  useEffect(() => {
    const handleGlobalKey = (e: KeyboardEvent) => {
      // Detect Android TV remote
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Escape', 'Backspace'].includes(e.key)) {
        setIsTvMode(true);
      }

      // Back / Escape Logic
      if (e.key === 'Escape' || e.key === 'Backspace' || e.keyCode === 4) {
        if (tgVideoUrl) setTgVideoUrl(null);
        else if (showCinemaScreen) setShowCinemaScreen(false);
        else if (showTgLogin) setShowTgLogin(false);
        else if (selectedMovie) setSelectedMovie(null);
        else if (isLocked) setIsLocked(false);

        // Prevent app exit on back button if something is open
        if (tgVideoUrl || showCinemaScreen || showTgLogin || selectedMovie || isLocked) {
          e.preventDefault();
        }
      }
    };
    window.addEventListener('keydown', handleGlobalKey);
    return () => window.removeEventListener('keydown', handleGlobalKey);
  }, [isLocked, selectedMovie, showTgLogin, showCinemaScreen, tgVideoUrl]);

  const handleTelegramSearch = async () => {
    setIsSearchingTg(true);
    setShowCinemaScreen(true);
    const res = await fetch(`/api/tg/search?query=${encodeURIComponent(selectedMovie.title)}`);
    const data = await res.json();
    setTgSearchResults(data.results || []);
    setIsSearchingTg(false);
  };

  return (
    <div className="w-full h-screen bg-black overflow-hidden relative font-sans text-white" dir="rtl">
      <Canvas camera={{ position: [0, 1.6, 2], fov: 75 }}>
        <Suspense fallback={null}>
          <Corridor movies={displayMovies} isTvMode={isTvMode} isLocked={isLocked} corridorZ={corridorZ} lookDirection={lookDirection} onPosterClick={setSelectedMovie} favorites={favorites} onToggleFavorite={(id: number) => setFavorites(p => p.includes(id) ? p.filter(f => f !== id) : [...p, id])} />
          <Player movies={displayMovies} isTvMode={isTvMode} isLocked={isLocked} corridorZ={corridorZ} setCorridorZ={setCorridorZ} lookDirection={lookDirection} setLookDirection={setLookDirection} setSelectedMovie={setSelectedMovie} corridorLength={(displayMovies.length / 2) * 5 + 10} />
        </Suspense>
        {!isTvMode && <PointerLockControls onLock={() => setIsLocked(true)} onUnlock={() => setIsLocked(false)} />}
      </Canvas>

      {/* Main HUD */}
      {!isLocked && !selectedMovie && (
        <div className="absolute inset-0 z-20 flex bg-black/40 backdrop-blur-sm">
          <div className="w-80 h-full bg-black/90 p-8 border-l border-[#00ffcc]/30 flex flex-col">
            <h1 className="text-2xl font-bold text-[#00ffcc] mb-8 flex items-center gap-2"><Film /> HoloCinema TV</h1>
            <div className="flex flex-col gap-4">
              <button onClick={() => setIsLocked(true)} className="py-4 bg-[#00ffcc] text-black font-bold rounded-xl focus:ring-4 focus:ring-white">היכנס למסדרון</button>
              <div className="h-px bg-white/10 my-4" />
              <p className="text-xs text-[#00ffcc] font-mono mb-2 uppercase">ז'אנרים</p>
              {['הכל', 'ישראלי', 'פעולה', 'מותחן', 'מועדפים'].map(g => (
                <button key={g} onClick={() => setGenre(g)} className={`py-3 rounded-xl text-right px-4 focus:ring-4 focus:ring-[#00ffcc] ${genre === g ? 'bg-[#00ffcc] text-black' : 'bg-white/5 hover:bg-white/10'}`}>{g}</button>
              ))}
            </div>
          </div>
          <div className="flex-1 flex items-center justify-center" onClick={() => setIsLocked(true)}>
            <div className="bg-black/60 px-8 py-4 rounded-full border border-[#00ffcc]/30 text-[#00ffcc] animate-pulse">
              לחץ OK כדי להתחיל
            </div>
          </div>
        </div>
      )}

      {/* Movie Details Modal */}
      <AnimatePresence>
        {selectedMovie && !showCinemaScreen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-30 flex items-center justify-center p-8 bg-black/90 backdrop-blur-md">
            <div className="max-w-4xl w-full bg-[#111] border border-[#00ffcc]/30 rounded-3xl overflow-hidden flex shadow-2xl">
              <img src={selectedMovie.poster} className="w-1/3 object-cover" />
              <div className="p-10 flex flex-col flex-1">
                <h2 className="text-4xl font-bold mb-4">{selectedMovie.title}</h2>
                <p className="text-gray-400 mb-8 leading-relaxed">{selectedMovie.desc}</p>
                <div className="mt-auto flex gap-4">
                  <button onClick={handleTelegramSearch} className="flex-1 py-4 bg-[#2AABEE] text-white font-bold rounded-xl focus:ring-4 focus:ring-white flex items-center justify-center gap-2">
                    <Play fill="white" /> צפה בטלגרם
                  </button>
                  <button onClick={() => setSelectedMovie(null)} className="px-8 py-4 bg-white/10 rounded-xl focus:ring-4 focus:ring-white">חזור</button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Cinema Screen (Telegram Results) */}
      <AnimatePresence>
        {showCinemaScreen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-40 bg-black flex flex-col p-8">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-2xl font-bold text-[#2AABEE]">תוצאות מטלגרם: {selectedMovie.title}</h2>
              <button onClick={() => setShowCinemaScreen(false)} className="p-3 bg-white/10 rounded-full"><X /></button>
            </div>

            <div className="flex-1 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-4">
              {isSearchingTg ? <div className="col-span-full flex items-center justify-center h-full"><Loader2 className="animate-spin w-12 h-12 text-[#2AABEE]" /></div> :
                tgSearchResults.map((res, i) => (
                  <button key={i} onClick={() => setTgVideoUrl(`/api/tg/stream/${res.peerId}/${res.id}`)} className="bg-white/5 border border-white/10 p-6 rounded-2xl text-right hover:border-[#2AABEE] focus:ring-4 focus:ring-[#2AABEE] flex items-center gap-4 group">
                    <div className="w-12 h-12 rounded-full bg-[#2AABEE]/20 flex items-center justify-center group-focus:bg-[#2AABEE]"><Play size={20} fill="currentColor" /></div>
                    <div className="flex-1">
                      <h3 className="font-bold truncate" dir="ltr">{res.title}</h3>
                      <p className="text-sm text-gray-500">{res.size} • {res.chatName}</p>
                    </div>
                  </button>
                ))
              }
            </div>

            {tgVideoUrl && (
              <div className="absolute inset-0 bg-black z-50">
                <video src={tgVideoUrl} controls autoPlay className="w-full h-full" />
                <button onClick={() => setTgVideoUrl(null)} className="absolute top-8 right-8 p-4 bg-black/50 rounded-xl">חזור לתוצאות</button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
