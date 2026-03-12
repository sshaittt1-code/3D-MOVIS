import React, { useState, useEffect, useRef, Suspense, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Text, SpotLight } from '@react-three/drei';
import * as THREE from 'three';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Play, Star, Film, Loader2, Search, Phone, Key, Lock, Heart, Shuffle, Type, TrendingUp } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE || '';

const isTvSelectKey = (e: KeyboardEvent) =>
  e.key === 'Enter' || e.key === 'Select' || e.keyCode === 23;

const blurActiveElement = () => {
  const activeElement = document.activeElement as HTMLElement | null;
  activeElement?.blur?.();
};

// --- Helper for Android Intents (MX Player) ---
const openInMXPlayer = (videoUrl: string, title: string, subtitleUrl?: string) => {
  const intentUrl = `intent:${videoUrl}#Intent;` +
    `package=com.mxtech.videoplayer.ad;` +
    `S.title=${encodeURIComponent(title)};` +
    (subtitleUrl ? `S.subs=${encodeURIComponent(subtitleUrl)};S.subs.name=Hebrew;` : '') +
    `end`;

  window.location.href = intentUrl;
};

// --- Mock Data ---
const BASE_MOVIES: any[] = [
  { id: 1, title: 'התחלה (Inception)', genre: 'מדע בדיוני', rating: 8.8, poster: 'https://image.tmdb.org/t/p/w500/8Z8dpt8NqCvxu4XTEcXCFCISCE0.jpg', desc: 'גנב שגונב סודות תאגידיים באמצעות טכנולוגיית שיתוף חלומות.' },
  { id: 2, title: 'בין כוכבים (Interstellar)', genre: 'מדע בדיוני', rating: 8.6, poster: 'https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MvrIdlsR.jpg', desc: 'צוות חוקרים נוסע דרך חור תולעת בחלל.' },
];

const fetchApiJson = async (path: string, init?: RequestInit) => {
  const response = await fetch(path, init);
  const bodyText = await response.text();
  if (bodyText.trim().startsWith('<')) throw new Error('API returned HTML. Check API Base URL.');
  return JSON.parse(bodyText);
};

// --- 3D Components ---
const TVController = ({ movies, isLocked, setIsLocked, setSelectedMovie, setFocusedId }: any) => {
  const { camera } = useThree();
  const [targetPos, setTargetPos] = useState(new THREE.Vector3(0, 1.6, 2));
  const [targetRot, setTargetRot] = useState(new THREE.Euler(0, 0, 0));
  const focusedMovieRef = useRef<any>(null);
  const STEP_SIZE = 0.8;

  useEffect(() => {
    const handleInput = (e: KeyboardEvent) => {
      if (!isLocked) return;
      const isDirectionalKey = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key);
      if (isDirectionalKey || isTvSelectKey(e)) {
        e.preventDefault();
        e.stopPropagation();
      }
      if (e.key === 'ArrowUp') {
        setTargetPos(p => new THREE.Vector3(p.x, p.y, p.z - STEP_SIZE));
        setTargetRot(new THREE.Euler(0, 0, 0));
      } else if (e.key === 'ArrowDown') {
        setTargetPos(p => new THREE.Vector3(p.x, p.y, Math.min(p.z + STEP_SIZE, 5)));
        setTargetRot(new THREE.Euler(0, 0, 0));
      } else if (e.key === 'ArrowLeft') setTargetRot(new THREE.Euler(0, Math.PI / 2.2, 0));
      else if (e.key === 'ArrowRight') setTargetRot(new THREE.Euler(0, -Math.PI / 2.2, 0));
      else if (isTvSelectKey(e)) {
        if (focusedMovieRef.current) {
          setSelectedMovie(focusedMovieRef.current);
          setIsLocked(false);
        }
      }
    };
    window.addEventListener('keydown', handleInput);
    return () => window.removeEventListener('keydown', handleInput);
  }, [isLocked, setSelectedMovie, setIsLocked]);

  useFrame(() => {
    if (isLocked) {
      camera.position.lerp(targetPos, 0.1);
      const targetQuat = new THREE.Quaternion().setFromEuler(targetRot);
      camera.quaternion.slerp(targetQuat, 0.1);

      const isLookingSide = Math.abs(targetRot.y) > 0.5;
      if (isLookingSide) {
        const side = targetRot.y > 0 ? 0 : 1;
        const zIndex = Math.round((camera.position.z + 2) / -5);
        const index = Math.max(0, zIndex * 2 + side);
        focusedMovieRef.current = movies[index] || null;
        setFocusedId(movies[index]?.uniqueId || null);
      } else {
        focusedMovieRef.current = null;
        setFocusedId(null);
      }
    }
  });
  return null;
};

const Poster = ({ movie, position, rotation, isFocused }: any) => {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  const groupRef = useRef<THREE.Group>(null!);
  useEffect(() => { new THREE.TextureLoader().load(movie.poster, (tex) => { tex.colorSpace = THREE.SRGBColorSpace; setTexture(tex); }); }, [movie.poster]);
  useFrame(() => { const targetScale = isFocused ? 1.4 : 1; groupRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, 1), 0.1); });
  return (
    <group position={position} rotation={rotation} ref={groupRef}>
      <mesh><planeGeometry args={[2.5, 3.75]} /><meshStandardMaterial map={texture} color={isFocused ? '#ffffff' : '#666666'} /></mesh>
      <mesh position={[0, 0, -0.02]}><planeGeometry args={[2.6, 3.85]} /><meshBasicMaterial color={isFocused ? '#00ffcc' : '#111111'} /></mesh>
      {isFocused && (
        <><Text position={[0, -2.3, 0]} fontSize={0.3} color="#00ffcc" anchorX="center">{movie.title}</Text><SpotLight position={[0, 2, 3]} intensity={5} color="#00ffcc" angle={0.6} penumbra={0.5} /></>
      )}
    </group>
  );
};

// --- Main App ---
export default function App() {
  const [baseMovies, setBaseMovies] = useState<any[]>([]);
  const [selectedMovie, setSelectedMovie] = useState<any>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [genre, setGenre] = useState('הכל');
  const [showCinemaScreen, setShowCinemaScreen] = useState(false);
  const [tgSearchResults, setTgSearchResults] = useState<any[]>([]);
  const [isSearchingTg, setIsSearchingTg] = useState(false);

  // Buffering States
  const [isBuffering, setIsBuffering] = useState(false);
  const [bufferProgress, setBufferProgress] = useState(0);

  const [apiBase, setApiBase] = useState(() => localStorage.getItem('api_base') || API_BASE);

  useEffect(() => {
    const handleMenuInput = (e: KeyboardEvent) => {
      if (isLocked || selectedMovie || showCinemaScreen) return;
      if (!isTvSelectKey(e)) return;

      e.preventDefault();
      e.stopPropagation();
      blurActiveElement();
      setIsLocked(true);
    };

    window.addEventListener('keydown', handleMenuInput);
    return () => window.removeEventListener('keydown', handleMenuInput);
  }, [isLocked, selectedMovie, showCinemaScreen]);

  useEffect(() => {
    if (isLocked) {
      blurActiveElement();
    }
  }, [isLocked]);

  useEffect(() => {
    const base = apiBase.replace(/\/$/, '');
    fetch(`${base}/api/movies`).then(res => res.json()).then(data => setBaseMovies(data.movies && data.movies.length > 0 ? data.movies : BASE_MOVIES)).catch(() => setBaseMovies(BASE_MOVIES));
  }, [apiBase]);

  const displayMovies = useMemo(() => {
    let filtered = baseMovies || [];
    if (genre !== 'הכל') filtered = filtered.filter((m: any) => m.genre === genre);
    return Array(5).fill(filtered.length ? filtered : []).flat().map((m, i) => ({ ...m, uniqueId: `${m.id}-${i}` }));
  }, [baseMovies, genre]);

  const handlePlayVideo = async (peerId: string, messageId: number, title: string) => {
    setIsBuffering(true);
    setBufferProgress(0);
    const base = apiBase.replace(/\/$/, '');
    const videoUrl = `${window.location.origin}${base}/api/tg/stream/${peerId}/${messageId}`;
    
    let progress = 0;
    const interval = setInterval(() => {
      progress += 5;
      setBufferProgress(progress);
      if (progress >= 100) {
        clearInterval(interval);
        setIsBuffering(false);
        fetch(`${base}/api/tg/search-subtitles?query=${encodeURIComponent(title)}`)
          .then(res => res.json())
          .then(subData => {
            const subUrl = subData.results?.[0] ? `${window.location.origin}${base}/api/tg/subtitle/${subData.results[0].peerId}/${subData.results[0].id}` : undefined;
            openInMXPlayer(videoUrl, title, subUrl);
          })
          .catch(() => openInMXPlayer(videoUrl, title));
      }
    }, 300);
  };

  return (
    <div className="w-full h-screen bg-black overflow-hidden relative text-white font-sans" dir="rtl">
      <Canvas camera={{ position: [0, 1.6, 2], fov: 75 }}>
        <ambientLight intensity={0.8} />
        <Suspense fallback={null}>
          <group>
             <mesh rotation={[-Math.PI/2, 0, 0]} position={[0,0,-100]}><planeGeometry args={[20, 300]} /><meshStandardMaterial color="#050505" /></mesh>
             <gridHelper args={[100, 50, '#00ffcc', '#001111']} position={[0, 0.01, -50]} />
             {displayMovies.map((movie: any, index: number) => {
                const zIndex = Math.floor(index / 2);
                const isLeft = index % 2 === 0;
                return <Poster key={movie.uniqueId} movie={movie} isFocused={focusedId === movie.uniqueId} position={[isLeft ? -4.9 : 4.9, 2.2, -zIndex * 5 - 2]} rotation={[0, isLeft ? Math.PI/2.2 : -Math.PI/2.2, 0]} />;
             })}
          </group>
          <TVController movies={displayMovies} isLocked={isLocked} setIsLocked={setIsLocked} setSelectedMovie={setSelectedMovie} setFocusedId={setFocusedId} />
        </Suspense>
      </Canvas>

      {!isLocked && !selectedMovie && (
        <div className="absolute inset-0 z-20 flex bg-black/80 backdrop-blur-xl">
          <div className="w-80 h-full bg-black/90 p-8 border-l border-[#00ffcc]/30 flex flex-col shadow-2xl">
            <h1 className="text-3xl font-bold text-[#00ffcc] mb-10">HoloCinema</h1>
            <button onClick={() => setIsLocked(true)} className="py-5 bg-[#00ffcc] text-black font-bold rounded-2xl focus:ring-4 focus:ring-white">כניסה למסדרון</button>
            <div className="mt-10 flex flex-col gap-3">
               {['הכל', 'ישראלי', 'פעולה'].map(g => (
                 <button key={g} onClick={() => setGenre(g)} className={`p-4 rounded-xl text-right transition-all ${genre === g ? 'bg-[#00ffcc] text-black' : 'bg-white/5'}`}>{g}</button>
               ))}
            </div>
          </div>
          <div className="flex-1 flex items-center justify-center text-[#00ffcc] animate-pulse text-2xl">לחץ OK להתחלה</div>
        </div>
      )}

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
                    <button key={i} onClick={() => handlePlayVideo(res.peerId, res.id, res.title)} className="bg-white/5 border border-white/10 p-8 rounded-[30px] text-right hover:border-blue-500 flex items-center gap-6 focus:ring-4 focus:ring-blue-400">
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

      {selectedMovie && !showCinemaScreen && (
        <div className="absolute inset-0 z-30 flex items-center justify-center p-8 bg-black/95">
           <div className="bg-[#0a0a0a] border border-[#00ffcc]/40 rounded-[40px] p-12 flex gap-12 max-w-5xl shadow-2xl">
              <img src={selectedMovie.poster} className="w-80 rounded-3xl object-cover shadow-2xl" />
              <div className="flex flex-col flex-1">
                 <h2 className="text-5xl font-bold mb-6">{selectedMovie.title}</h2>
                 <p className="text-xl text-gray-400 mb-10 leading-relaxed overflow-y-auto max-h-48">{selectedMovie.desc}</p>
                 <div className="flex gap-6 mt-auto">
                    <button onClick={() => {
                      setIsSearchingTg(true); setShowCinemaScreen(true);
                      fetchApiJson(`${apiBase.replace(/\/$/, '')}/api/tg/search?query=${encodeURIComponent(selectedMovie.title)}`)
                        .then(data => { setTgSearchResults(data.results || []); setIsSearchingTg(false); });
                    }} className="flex-1 py-5 bg-[#2AABEE] text-white text-xl font-bold rounded-2xl shadow-xl focus:ring-4 focus:ring-white">צפה בטלגרם (MX Player)</button>
                    <button onClick={() => setSelectedMovie(null)} className="px-10 py-5 bg-white/10 rounded-2xl focus:ring-4 focus:ring-white">חזור</button>
                 </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
}
