import React, { useState, useEffect, useRef, Suspense, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Text, SpotLight } from '@react-three/drei';
import * as THREE from 'three';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Play, Star, Film, Loader2, Search, Phone, Key, Lock, Heart, Shuffle, Type, TrendingUp } from 'lucide-react';

// If VITE_API_BASE is empty (e.g. running locally via Capacitor), try to determine the local network IP or default to emulator localhost.
const getApiBase = () => {
  if (import.meta.env.VITE_API_BASE) return import.meta.env.VITE_API_BASE;
  if (import.meta.env.VITE_API_BASE_URL) return import.meta.env.VITE_API_BASE_URL;
  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    return `http://${window.location.hostname}:3000`;
  }
  return 'http://10.0.2.2:3000'; // Default Android Emulator to Host IP
};
const API_BASE = getApiBase();
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
const TVController = ({ posterLayout, isLocked, setSelectedMovie, setFocusedId, isAnyModalOpen }: any) => {
  const { camera } = useThree();
  const [targetPos, setTargetPos] = useState(new THREE.Vector3(0, 1.6, 2));
  const focusedMovieRef = useRef<any>(null);
  const STEP_SIZE = 0.8;
  const ROTATION_SPEED = 0.012; // slow down significantly
  
  // Track key states for smooth camera movement
  const keys = useRef<{ left: boolean; right: boolean }>({ left: false, right: false });
  // We explicitly control the target Y rotation
  const targetRotY = useRef(0);

  // Setup raycaster for center of screen
  const raycaster = useRef(new THREE.Raycaster());
  const centerPointer = useRef(new THREE.Vector2(0, 0));

  useEffect(() => {
    const handleInput = (e: KeyboardEvent) => {
      // Don't intercept global events if a modal is open, let the CSS dialog/focus handle it.
      if (!isLocked || isAnyModalOpen) return;
      
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
        if (focusedMovieRef.current) {
          setSelectedMovie(focusedMovieRef.current);
        }
      }
    };

    const handleInputUp = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        keys.current.left = false;
      } else if (e.key === 'ArrowRight') {
        keys.current.right = false;
      }
      if (isLocked && !isAnyModalOpen && isTvNavigationKey(e)) stopTvEvent(e);
    };

    window.addEventListener('keydown', handleInput, true);
    window.addEventListener('keyup', handleInputUp, true);
    return () => {
      window.removeEventListener('keydown', handleInput, true);
      window.removeEventListener('keyup', handleInputUp, true);
    };
  }, [isLocked, setSelectedMovie, isAnyModalOpen]);

  useFrame((state) => {
    if (isLocked && !isAnyModalOpen) {
      // Smoothly update camera rotation based on held keys
      if (keys.current.left) {
        targetRotY.current += ROTATION_SPEED;
      }
      if (keys.current.right) {
        targetRotY.current -= ROTATION_SPEED;
      }

      // Clamp rotation to max +- 90 degrees (Math.PI / 2)
      targetRotY.current = Math.max(-Math.PI / 1.8, Math.min(Math.PI / 1.8, targetRotY.current));

      // Apply lerp to smooth the transition for position
      camera.position.lerp(targetPos, 0.1);
      
      // Slerp for rotation
      const targetQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, targetRotY.current, 0));
      camera.quaternion.slerp(targetQuat, 0.15);

      // Raycast from the center of the camera to find the poster we're looking at
      raycaster.current.setFromCamera(centerPointer.current, camera);
      const intersects = raycaster.current.intersectObjects(state.scene.children, true);
      
      let foundPoster = false;
      if (intersects.length > 0) {
        // Find the FIRST object in the intersection list that is a poster
        const firstPosterIntersect = intersects.find(
          (intersect) => intersect.object.name === 'poster_mesh' && intersect.object.userData.uniqueId
        );

        if (firstPosterIntersect) {
          const movieId = firstPosterIntersect.object.userData.uniqueId;
          const matchedPoster = posterLayout.find((p: any) => p.movie.uniqueId === movieId);
          
          if (matchedPoster) {
            focusedMovieRef.current = matchedPoster.movie;
            setFocusedId(movieId);
            foundPoster = true;
          }
        }
      }

      if (!foundPoster) {
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
  useEffect(() => { 
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    loader.load(movie.poster, (tex) => { 
      tex.colorSpace = THREE.SRGBColorSpace; 
      setTexture(tex); 
    }); 
  }, [movie.poster]);
  useFrame(() => { 
    const targetScale = isFocused ? 1.4 : 1; 
    groupRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, 1), 0.1); 
  });
  return (
    <group position={position} rotation={rotation} ref={groupRef}>
      {/* Target both meshes for raycasting */}
      <mesh name="poster_mesh" userData={{ uniqueId: movie.uniqueId }} position={[0, 0, 0.01]}>
        <planeGeometry args={[2.5, 3.75]} />
        <meshStandardMaterial map={texture} color={isFocused ? '#ffffff' : '#acacac'} />
      </mesh>
      <mesh name="poster_mesh" userData={{ uniqueId: movie.uniqueId }} position={[0, 0, -0.02]}>
        <planeGeometry args={[2.6, 3.85]} />
        <meshBasicMaterial color={isFocused ? '#00ffcc' : '#111111'} />
      </mesh>
      
      {/* Title always shows, glows when focused */}
      <Text position={[0, -2.4, 0.01]} fontSize={0.3} color={isFocused ? "#00ffcc" : "#ffffff"} anchorX="center" maxWidth={2.6} textAlign="center">
        {movie.title}
      </Text>
      
      {isFocused && (
        <SpotLight position={[0, 2, 3]} intensity={5} color="#00ffcc" angle={0.6} penumbra={0.5} />
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
  const [showSettings, setShowSettings] = useState(false);
  const [tgSearchResults, setTgSearchResults] = useState<any[]>([]);
  const [isSearchingTg, setIsSearchingTg] = useState(false);

  // Buffering States
  const [isBuffering, setIsBuffering] = useState(false);
  const [bufferProgress, setBufferProgress] = useState(0);

  const [apiBase, setApiBase] = useState(() => localStorage.getItem('api_base') || API_BASE);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [tgStatus, setTgStatus] = useState<'checking' | 'loggedOut' | 'phoneInput' | 'codeInput' | 'passwordInput' | 'loggedIn'>('checking');
  const [phone, setPhone] = useState('+972');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  useEffect(() => {
    const base = apiBase.replace(/\/$/, '');
    fetch(`${base}/api/tg/status`)
      .then(res => res.json())
      .then(data => setTgStatus(data.loggedIn ? 'loggedIn' : 'loggedOut'))
      .catch(() => setTgStatus('loggedOut'));
  }, [apiBase]);

  useEffect(() => {
    const handleGlobalBack = (e: KeyboardEvent) => {
      // Catch TV Android escape buttons. TV remotes might send 'Escape' or 'Backspace'
      if (e.key === 'Escape' || e.key === 'Backspace') {
        if (tgStatus === 'phoneInput' || tgStatus === 'codeInput' || tgStatus === 'passwordInput') {
          stopTvEvent(e);
          setTgStatus('loggedOut');
        } else if (showCinemaScreen) {
          stopTvEvent(e);
          setShowCinemaScreen(false);
        } else if (selectedMovie) {
          stopTvEvent(e);
          setSelectedMovie(null);
        } else if (isLocked) {
          // If in 3D mode but no movie selected, go back to main screen
          stopTvEvent(e);
          setIsLocked(false);
          setFocusedId(null);
        }
      }
    };
    
    const handleMenuInput = (e: KeyboardEvent) => {
      if (!isTvSelectKey(e)) return;
      
      // If we are showing the corridor and nothing selected yet, start playing
      if (!isLocked && !selectedMovie && !showCinemaScreen) {
        stopTvEvent(e);
        blurActiveElement();
        setIsLocked(true);
      }
      // If we're already locked and looking at a movie (but no modal open), that's handled by TVController
    };
    
    const suppressMenuKeyUp = (e: KeyboardEvent) => {
      if (isTvSelectKey(e)) {
        // VERY IMPORTANT: Prevent Android webview from firing synthetic "onClick" events across the DOM
        // when the user releases the "OK/Enter" button on the TV remote.
        e.preventDefault();
        e.stopPropagation();
      }
    };

    window.addEventListener('keydown', handleMenuInput, true);
    window.addEventListener('keydown', handleGlobalBack, true);
    window.addEventListener('keyup', suppressMenuKeyUp, true);
    return () => {
      window.removeEventListener('keydown', handleMenuInput, true);
      window.removeEventListener('keydown', handleGlobalBack, true);
      window.removeEventListener('keyup', suppressMenuKeyUp, true);
    };
  }, [isLocked, selectedMovie, showCinemaScreen]);

  useEffect(() => {
    if (isLocked) {
      blurActiveElement();
    }
  }, [isLocked]);

  useEffect(() => {
    const base = apiBase.replace(/\/$/, '');
    fetch(`${base}/api/movies`)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
        return res.json();
      })
      .then(data => {
        setFetchError(null);
        setBaseMovies(data.movies && data.movies.length > 0 ? data.movies : BASE_MOVIES);
      })
      .catch((err) => {
        setFetchError(`שגיאת תקשורת: ${err.message}. מנסה להתחבר ל: ${base}/api/movies`);
        setBaseMovies(BASE_MOVIES);
      });
  }, [apiBase]);

  const displayMovies = useMemo(() => {
    let filtered = baseMovies || [];
    if (genre !== 'הכל') filtered = filtered.filter((m: any) => m.genre === genre);
    // 100 movies are fetched from backend, so no need to artificially repeat them anymore.
    return filtered.map((m: any, i: number) => ({ ...m, uniqueId: `${m.id}-${i}` }));
  }, [baseMovies, genre]);

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
              {posterLayout.map(({ movie, position, rotation }: any) => (
                <Poster key={movie.uniqueId} movie={movie} isFocused={focusedId === movie.uniqueId} position={position} rotation={rotation} />
             ))}
          </group>
          <TVController posterLayout={posterLayout} isLocked={isLocked} setSelectedMovie={setSelectedMovie} setFocusedId={setFocusedId} isAnyModalOpen={!!selectedMovie || showCinemaScreen} />
        </Suspense>
      </Canvas>

      {/* Red Dot Reticle */}
      {isLocked && !selectedMovie && !showCinemaScreen && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none flex items-center justify-center">
          <div className="w-2 h-2 bg-red-600 rounded-full shadow-[0_0_8px_4px_rgba(220,38,38,0.8)]"></div>
        </div>
      )}

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
                    const base = apiBase.replace(/\/$/, '');
                    fetchApiJson(`${base}/api/tg/startLogin`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ phone }) })
                      .then(() => setTgStatus('codeInput'))
                      .catch(err => setLoginError(`שגיאה: ${err.message}`));
                  }} className="w-full py-5 bg-[#2AABEE] text-white text-2xl font-bold rounded-2xl shadow-xl hover:bg-blue-400 transition-colors">שלח קוד אימות</button>
                </>
              )}
              
              {tgStatus === 'codeInput' && (
                <>
                  <p className="text-xl text-gray-400 mb-8 text-center">הזן את הקוד שקיבלת באפליקציית טלגרם למספר {phone}</p>
                  <input type="text" value={code} onChange={e => setCode(e.target.value)} dir="ltr" className="w-full text-center text-5xl tracking-[0.5em] p-6 rounded-2xl bg-white/5 border border-white/10 focus:border-green-500 outline-none mb-8" placeholder="12345" />
                  <button onClick={() => {
                     setLoginError('');
                     const base = apiBase.replace(/\/$/, '');
                     fetchApiJson(`${base}/api/tg/submitCode`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ code }) })
                       .then((res) => {
                          if (res.requiresPassword) setTgStatus('passwordInput');
                          else setTgStatus('loggedIn');
                       })
                       .catch(err => {
                          if (err.message.includes('password') || err.message.includes('2FA')) setTgStatus('passwordInput');
                          else setLoginError(`שגיאה בקוד: ${err.message}`);
                       });
                  }} className="w-full py-5 bg-green-500 text-black text-2xl font-bold rounded-2xl shadow-xl hover:bg-green-400 transition-colors">אמת והתחבר</button>
                </>
              )}

              {tgStatus === 'passwordInput' && (
                <>
                  <p className="text-xl text-gray-400 mb-8 text-center">החשבון מוגן בסיסמה (2FA). הזן סיסמה:</p>
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)} dir="ltr" className="w-full text-center text-4xl p-6 rounded-2xl bg-white/5 border border-white/10 focus:border-red-500 outline-none mb-8" />
                  <button onClick={() => {
                     setLoginError('');
                     const base = apiBase.replace(/\/$/, '');
                     fetchApiJson(`${base}/api/tg/submitPassword`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ password }) })
                       .then(() => setTgStatus('loggedIn'))
                       .catch(err => setLoginError(`שגיאה בסיסמה: ${err.message}`));
                  }} className="w-full py-5 bg-red-500 text-white text-2xl font-bold rounded-2xl shadow-xl hover:bg-red-400 transition-colors">שלח סיסמה</button>
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
            <div className="mt-10 flex flex-col gap-3">
               {['הכל', 'ישראלי', 'פעולה'].map(g => (
                 <button key={g} onClick={() => setGenre(g)} className={`p-4 rounded-xl text-right transition-all ${genre === g ? 'bg-[#00ffcc] text-black' : 'bg-white/5'}`}>{g}</button>
               ))}
               <button onClick={() => setShowSettings(true)} className="p-4 rounded-xl text-right transition-all bg-white/5 mt-4 text-gray-300 hover:text-white border border-white/5">⚙️ הגדרות</button>
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
              
              <div className="w-full bg-white/5 border border-white/10 rounded-2xl p-6 mb-8 flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm mb-1">סטטוס חיבור טלגרם</p>
                  <p className="text-2xl font-bold">{tgStatus === 'loggedIn' ? 'מחובר ✔️' : 'מנותק ❌'}</p>
                </div>
                {tgStatus === 'loggedIn' && (
                  <button onClick={() => {
                     const base = apiBase.replace(/\/$/, '');
                     fetchApiJson(`${base}/api/tg/logout`, { method: 'POST' })
                       .then(() => setTgStatus('loggedOut'));
                  }} className="px-6 py-3 bg-red-500/20 text-red-400 border border-red-500/50 rounded-xl hover:bg-red-500 hover:text-white transition-colors">התנתק</button>
                )}
              </div>

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
                      if (tgStatus !== 'loggedIn') {
                        setTgStatus('phoneInput');
                        return;
                      }
                      setIsSearchingTg(true); setShowCinemaScreen(true);
                      const cleanTitle = selectedMovie.title.split('(')[0].trim();
                      fetchApiJson(`${apiBase.replace(/\/$/, '')}/api/tg/search?query=${encodeURIComponent(cleanTitle)}`)
                        .then(data => { setTgSearchResults(data.results || []); setIsSearchingTg(false); });
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
