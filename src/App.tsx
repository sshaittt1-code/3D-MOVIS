import React, { useState, useEffect, useRef, Suspense, useMemo } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PointerLockControls, Text, SpotLight } from '@react-three/drei';
import * as THREE from 'three';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Play, Star, Film, Loader2, RefreshCcw, Search, Phone, Key, Lock, Heart, Shuffle, Type, TrendingUp } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE || '';

const BASE_MOVIES: any[] = [
  { id: 1, title: 'התחלה (Inception)', genre: 'מדע בדיוני', rating: 8.8, popularity: 95, poster: 'https://image.tmdb.org/t/p/w500/8Z8dpt8NqCvxu4XTEcXCFCISCE0.jpg', trailer: 'https://www.youtube.com/embed/YoHD9XEInc0', desc: 'גנב שגונב סודות תאגידיים באמצעות טכנולוגיית שיתוף חלומות מקבל משימה הפוכה של שתילת רעיון במוחו של מנכ"ל.' },
  { id: 2, title: 'בין כוכבים (Interstellar)', genre: 'מדע בדיוני', rating: 8.6, popularity: 90, poster: 'https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MvrIdlsR.jpg', trailer: 'https://www.youtube.com/embed/zSWdZVtXT7E', desc: 'צוות חוקרים נוסע דרך חור תולעת בחלל בניסיון להבטיח את הישרדותה של האנושות.' },
  { id: 3, title: 'מטריקס (The Matrix)', genre: 'מדע בדיוני', rating: 8.7, popularity: 92, poster: 'https://image.tmdb.org/t/p/w500/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg', trailer: 'https://www.youtube.com/embed/vKQi3bBA1y8', desc: 'כאשר זרה יפהפייה מובילה את האקר המחשבים ניאו לעולם תחתון אסור, הוא מגלה את האמת המזעזעת - החיים שהוא מכיר הם הונאה מורכבת של אינטליגנציה קיברנטית מרושעת.' },
];

// Controller for TV Remote Navigation
const TVController = ({ movies, isLocked, setIsLocked, setSelectedMovie }: any) => {
  const { camera } = useThree();
  const [targetPos, setTargetPos] = useState(new THREE.Vector3(0, 1.6, 2));
  const [targetRot, setTargetRot] = useState(new THREE.Euler(0, 0, 0));
  const [focusedMovie, setFocusedMovie] = useState<any>(null);

  const STEP_SIZE = 0.6; // Small movements per click
  const corridorLength = (movies.length / 2) * 5 + 10;

  useEffect(() => {
    const handleInput = (e: KeyboardEvent) => {
      if (!isLocked) return;

      if (e.key === 'ArrowUp') {
        setTargetPos(p => new THREE.Vector3(p.x, p.y, Math.max(p.z - STEP_SIZE, -corridorLength + 5)));
        setTargetRot(new THREE.Euler(0, 0, 0));
      } else if (e.key === 'ArrowDown') {
        setTargetPos(p => new THREE.Vector3(p.x, p.y, Math.min(p.z + STEP_SIZE, 5)));
        setTargetRot(new THREE.Euler(0, 0, 0));
      } else if (e.key === 'ArrowLeft') {
        setTargetRot(new THREE.Euler(0, Math.PI / 2.2, 0));
      } else if (e.key === 'ArrowRight') {
        setTargetRot(new THREE.Euler(0, -Math.PI / 2.2, 0));
      } else if (e.key === 'Enter' || e.key === 'Select' || e.keyCode === 23) {
        if (focusedMovie) {
          setSelectedMovie(focusedMovie);
          setIsLocked(false);
        }
      }
    };
    window.addEventListener('keydown', handleInput);
    return () => window.removeEventListener('keydown', handleInput);
  }, [isLocked, corridorLength, focusedMovie, setSelectedMovie, setIsLocked]);

  useFrame(() => {
    if (isLocked) {
      camera.position.lerp(targetPos, 0.08);
      const targetQuat = new THREE.Quaternion().setFromEuler(targetRot);
      camera.quaternion.slerp(targetQuat, 0.08);

      // Logical Focus: identify the poster the camera is facing
      const isLookingSide = Math.abs(targetRot.y) > 0.5;
      if (isLookingSide) {
        const side = targetRot.y > 0 ? 0 : 1; // 0 for left, 1 for right
        const zIndex = Math.round((camera.position.z - 3) / -5);
        const index = zIndex * 2 + side;
        setFocusedMovie(movies[index] || null);
      } else {
        setFocusedMovie(null);
      }
    }
  });

  return null;
};

const Poster = ({ movie, position, rotation, isFocused }: any) => {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  const groupRef = useRef<THREE.Group>(null!);

  useEffect(() => {
    new THREE.TextureLoader().load(movie.poster, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      setTexture(tex);
    });
  }, [movie.poster]);

  useFrame(() => {
    const targetScale = isFocused ? 1.35 : 1;
    groupRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, 1), 0.1);
  });

  return (
    <group position={position} rotation={rotation} ref={groupRef}>
      <mesh>
        <planeGeometry args={[2.5, 3.75]} />
        <meshStandardMaterial map={texture} color={isFocused ? '#ffffff' : '#777777'} />
      </mesh>
      <mesh position={[0, 0, -0.02]}>
        <planeGeometry args={[2.6, 3.85]} />
        <meshBasicMaterial color={isFocused ? '#00ffcc' : '#111111'} />
      </mesh>
      <Text position={[0, -2.1, 0]} fontSize={0.25} color={isFocused ? '#00ffcc' : '#888888'}>{movie.title}</Text>
      {isFocused && <SpotLight position={[0, 2, 2]} angle={0.5} penumbra={0.5} intensity={4} color="#00ffcc" />}
    </group>
  );
};

export default function App() {
  const [baseMovies, setBaseMovies] = useState<any[]>([]);
  const [selectedMovie, setSelectedMovie] = useState<any>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [genre, setGenre] = useState('הכל');
  const [showCinemaScreen, setShowCinemaScreen] = useState(false);
  const [tgVideoUrl, setTgVideoUrl] = useState<string | null>(null);
  const [apiBase, setApiBase] = useState(() => localStorage.getItem('api_base') || API_BASE);
  const [focusedMovieId, setFocusedMovieId] = useState<string | null>(null);

  useEffect(() => {
    const base = apiBase.replace(/\/$/, '');
    fetch(`${base}/api/movies`).then(res => res.json()).then(data => setBaseMovies(data.movies)).catch(() => setBaseMovies(BASE_MOVIES));
  }, [apiBase]);

  const displayMovies = useMemo(() => {
    let filtered = baseMovies || [];
    if (genre !== 'הכל') filtered = filtered.filter((m: any) => m.genre === genre);
    return Array(5).fill(filtered).flat().map((m, i) => ({ ...m, uniqueId: `${m.id}-${i}` }));
  }, [baseMovies, genre]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Backspace' || e.keyCode === 4) {
        if (tgVideoUrl) setTgVideoUrl(null);
        else if (showCinemaScreen) setShowCinemaScreen(false);
        else if (selectedMovie) setSelectedMovie(null);
        else if (isLocked) setIsLocked(false);
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', handleKey);
    const backListener = CapacitorApp.addListener('backButton', () => {
       if (tgVideoUrl) setTgVideoUrl(null);
       else if (showCinemaScreen) setShowCinemaScreen(false);
       else if (selectedMovie) setSelectedMovie(null);
       else if (isLocked) setIsLocked(false);
    });
    return () => {
      window.removeEventListener('keydown', handleKey);
      backListener.then(l => l.remove());
    };
  }, [isLocked, selectedMovie, showCinemaScreen, tgVideoUrl]);

  return (
    <div className="w-full h-screen bg-black overflow-hidden relative text-white font-sans" dir="rtl">
      <Canvas camera={{ position: [0, 1.6, 2], fov: 75 }}>
        <ambientLight intensity={0.6} />
        <Suspense fallback={null}>
          <group>
             <mesh rotation={[-Math.PI/2, 0, 0]} position={[0,0,-50]}><planeGeometry args={[15, 200]} /><meshStandardMaterial color="#050505" /></mesh>
             <gridHelper args={[100, 50, '#00ffcc', '#002222']} position={[0, 0.01, -50]} />
             {displayMovies.map((movie: any, index: number) => {
                const isLeft = index % 2 === 0;
                const zIndex = Math.floor(index / 2);
                return <Poster key={movie.uniqueId} movie={movie} position={[isLeft ? -4.9 : 4.9, 2.2, -zIndex * 5 - 2]} rotation={[0, isLeft ? Math.PI/2.2 : -Math.PI/2.2, 0]} />;
             })}
          </group>
          <TVController movies={displayMovies} isLocked={isLocked} setIsLocked={setIsLocked} setSelectedMovie={setSelectedMovie} />
        </Suspense>
      </Canvas>

      {!isLocked && !selectedMovie && (
        <div className="absolute inset-0 z-20 flex bg-black/70 backdrop-blur-lg">
          <div className="w-80 h-full bg-black/90 p-8 border-l border-[#00ffcc]/30 flex flex-col">
            <h1 className="text-2xl font-bold text-[#00ffcc] mb-8 flex items-center gap-2"><Film /> HoloCinema TV</h1>
            <button onClick={() => setIsLocked(true)} className="py-4 bg-[#00ffcc] text-black font-bold rounded-xl focus:ring-4 focus:ring-white">היכנס למסדרון</button>
            <div className="mt-8 flex flex-col gap-2">
               {['הכל', 'ישראלי', 'פעולה'].map(g => (
                 <button key={g} onClick={() => setGenre(g)} className={`p-3 rounded-lg text-right ${genre === g ? 'bg-[#00ffcc] text-black' : 'bg-white/5 focus:bg-white/20'}`}>{g}</button>
               ))}
            </div>
          </div>
          <div className="flex-1 flex items-center justify-center"><div className="text-[#00ffcc] animate-pulse text-xl font-mono">OK כדי להתחיל</div></div>
        </div>
      )}

      {selectedMovie && (
        <div className="absolute inset-0 z-30 flex items-center justify-center p-8 bg-black/95">
           <div className="bg-[#111] border border-[#00ffcc]/30 rounded-3xl p-10 flex gap-8 max-w-4xl shadow-2xl">
              <img src={selectedMovie.poster} className="w-64 rounded-xl object-cover" />
              <div className="flex flex-col flex-1">
                 <h2 className="text-4xl font-bold mb-4">{selectedMovie.title}</h2>
                 <p className="text-gray-400 mb-8 leading-relaxed">{selectedMovie.desc}</p>
                 <div className="flex gap-4">
                    <button onClick={() => setShowCinemaScreen(true)} className="flex-1 py-4 bg-[#2AABEE] rounded-xl font-bold focus:ring-4 focus:ring-white">חפש בטלגרם</button>
                    <button onClick={() => setSelectedMovie(null)} className="px-8 py-4 bg-white/10 rounded-xl focus:ring-4 focus:ring-white">חזור</button>
                 </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
}
