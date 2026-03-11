import React, { useState, useEffect, useRef, Suspense, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PointerLockControls, Text, Environment, SpotLight } from '@react-three/drei';
import * as THREE from 'three';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Play, Info, Star, TrendingUp, Type, Film, Heart, Shuffle, Search, Phone, Key, Lock, Loader2 } from 'lucide-react';

// Extended Mock Data with Israeli content (Fallback if API fails)
const BASE_MOVIES: any[] = [];

// Player Movement Hook
const usePlayerControls = () => {
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
        case 'ArrowUp': setMovement((m) => ({ ...m, forward: true })); break;
        case 'KeyS':
        case 'ArrowDown': setMovement((m) => ({ ...m, backward: true })); break;
        case 'KeyA':
        case 'ArrowLeft': setMovement((m) => ({ ...m, left: true })); break;
        case 'KeyD':
        case 'ArrowRight': setMovement((m) => ({ ...m, right: true })); break;
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
  }, []);

  return movement;
};

const Player = ({ corridorLength, movies }: { corridorLength: number, movies: any[] }) => {
  const { forward, backward, left, right } = usePlayerControls();
  const { camera } = useThree();
  const speed = 8; // Faster for infinite corridor
  const direction = new THREE.Vector3();
  const frontVector = new THREE.Vector3();
  const sideVector = new THREE.Vector3();

  // Reset position when movies list changes (e.g., new filter)
  useEffect(() => {
    camera.position.set(0, 1.6, 2);
    camera.rotation.set(0, 0, 0);
  }, [movies, camera]);

  useFrame((state, delta) => {
    frontVector.set(0, 0, Number(backward) - Number(forward));
    sideVector.set(Number(left) - Number(right), 0, 0);
    direction.subVectors(frontVector, sideVector).normalize().multiplyScalar(speed * delta);
    
    // Apply movement relative to camera rotation
    camera.translateX(direction.x);
    camera.translateZ(direction.z);
    
    // Keep camera at a fixed height
    camera.position.y = 1.6;
    
    // Constrain to corridor
    if (camera.position.x > 3.5) camera.position.x = 3.5;
    if (camera.position.x < -3.5) camera.position.x = -3.5;
    if (camera.position.z > 5) camera.position.z = 5;
    if (camera.position.z < -corridorLength + 5) camera.position.z = -corridorLength + 5;
  });

  return null;
};

const Poster = ({ movie, position, rotation, onClick, setHoveredPoster, isFavorite, onToggleFavorite, isFocused }: any) => {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  const [hovered, setHovered] = useState(false);
  const [heartHovered, setHeartHovered] = useState(false);
  const groupRef = useRef<any>();

  useEffect(() => {
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    loader.load(
      movie.poster,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        setTexture(tex);
      },
      undefined,
      (err) => console.error('Error loading texture for', movie.title, err)
    );
  }, [movie.poster]);

  useFrame(() => {
    if (groupRef.current) {
      const targetScale = isFocused ? 1.1 : 1;
      groupRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, 1), 0.1);
    }
  });

  return (
    <group position={position} rotation={rotation} ref={groupRef}>
      
      {/* Favorite Heart Button */}
      <group 
        position={[0, 2.3, 0]} 
        onClick={(e) => { 
          e.stopPropagation(); 
          onToggleFavorite(movie.id); 
        }}
        onPointerOver={(e) => { e.stopPropagation(); setHeartHovered(true); }}
        onPointerOut={(e) => { e.stopPropagation(); setHeartHovered(false); }}
      >
        {/* Invisible hit box to make clicking easier */}
        <mesh visible={false}>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial />
        </mesh>
        <Text
          fontSize={0.4}
          color={isFavorite ? '#ff0055' : (heartHovered ? '#ff99bb' : '#555555')}
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.02}
          outlineColor="#000000"
        >
          {isFavorite ? '♥' : '♡'}
        </Text>
      </group>

      {/* Poster Mesh */}
      <mesh 
        onPointerOver={(e) => { 
          e.stopPropagation(); 
          setHovered(true); 
          setHoveredPoster(movie);
        }}
        onPointerOut={(e) => { 
          e.stopPropagation(); 
          setHovered(false); 
          setHoveredPoster(null);
        }}
        onClick={(e) => { 
          e.stopPropagation(); 
          onClick(movie); 
        }}
      >
        <planeGeometry args={[2.5, 3.75]} />
        {texture ? (
          <meshStandardMaterial map={texture} color={hovered ? '#ffffff' : '#cccccc'} roughness={0.2} metalness={0.1} />
        ) : (
          <meshStandardMaterial color={hovered ? '#444444' : '#222222'} roughness={0.2} metalness={0.1} />
        )}
      </mesh>
      
      {/* Holographic frame */}
      <mesh position={[0, 0, -0.02]}>
        <planeGeometry args={[2.6, 3.85]} />
        <meshBasicMaterial color={(hovered || isFocused) ? '#00ffcc' : '#111111'} />
      </mesh>

      {/* Title */}
      <Text
        position={[0, -2.1, 0]}
        fontSize={0.25}
        color={(hovered || isFocused) ? '#00ffcc' : '#888888'}
        anchorX="center"
        anchorY="middle"
      >
        {movie.title}
      </Text>
      
      {/* Subtitle (Genre & Rating) */}
      <Text
        position={[0, -2.4, 0]}
        fontSize={0.15}
        color={hovered ? '#ffffff' : '#555555'}
        anchorX="center"
        anchorY="middle"
      >
        {`${movie.genre} • ★ ${movie.rating}`}
      </Text>

      {/* SpotLight for each poster */}
      {hovered && (
        <SpotLight
          position={[0, 2, 2]}
          angle={0.5}
          penumbra={0.5}
          intensity={2}
          color="#00ffcc"
          target-position={[0, 0, 0]}
        />
      )}
    </group>
  );
};

const CameraController = ({ isLocked, isTvMode, corridorZ, lookDirection }: any) => {
  useFrame((state) => {
    if (isTvMode && isLocked) {
      const targetZ = -corridorZ * 5 + 3;
      const targetX = 0;
      
      state.camera.position.z = THREE.MathUtils.lerp(state.camera.position.z, targetZ, 0.1);
      state.camera.position.x = THREE.MathUtils.lerp(state.camera.position.x, targetX, 0.1);
      state.camera.position.y = 1.6;

      let targetRotY = 0;
      if (lookDirection === 'left') targetRotY = Math.PI / 2;
      if (lookDirection === 'right') targetRotY = -Math.PI / 2;

      const targetQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, targetRotY, 0));
      state.camera.quaternion.slerp(targetQuat, 0.1);
    }
  });
  return null;
};

const Corridor = ({ movies, onPosterClick, setHoveredPoster, favorites, onToggleFavorite, isTvMode, isLocked, corridorZ, lookDirection }: any) => {
  const length = (movies.length / 2) * 5 + 10;
  
  // Generate holographic arches
  const numArches = Math.floor(length / 10);
  const arches = Array.from({ length: numArches }).map((_, i) => (
    <group key={`arch-${i}`} position={[0, 0, -i * 10]}>
      <mesh position={[-5.1, 2.5, 0]}>
        <boxGeometry args={[0.2, 5, 0.5]} />
        <meshStandardMaterial color="#00ffcc" emissive="#00ffcc" emissiveIntensity={0.5} />
      </mesh>
      <mesh position={[5.1, 2.5, 0]}>
        <boxGeometry args={[0.2, 5, 0.5]} />
        <meshStandardMaterial color="#00ffcc" emissive="#00ffcc" emissiveIntensity={0.5} />
      </mesh>
      <mesh position={[0, 5.1, 0]}>
        <boxGeometry args={[10.4, 0.2, 0.5]} />
        <meshStandardMaterial color="#00ffcc" emissive="#00ffcc" emissiveIntensity={0.5} />
      </mesh>
    </group>
  ));

  return (
    <group>
      {/* Floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -length / 2 + 5]}>
        <planeGeometry args={[10, length]} />
        <meshStandardMaterial color="#050505" roughness={0.8} metalness={0.2} />
      </mesh>

      {/* Holographic Path / Red Carpet */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, -length / 2 + 5]}>
        <planeGeometry args={[3, length]} />
        <meshStandardMaterial color="#001122" roughness={0.4} metalness={0.8} />
      </mesh>
      {/* Path glowing edges */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-1.5, 0.02, -length / 2 + 5]}>
        <planeGeometry args={[0.05, length]} />
        <meshBasicMaterial color="#00ffcc" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[1.5, 0.02, -length / 2 + 5]}>
        <planeGeometry args={[0.05, length]} />
        <meshBasicMaterial color="#00ffcc" />
      </mesh>
      
      {/* Ceiling */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 5, -length / 2 + 5]}>
        <planeGeometry args={[10, length]} />
        <meshStandardMaterial color="#020202" roughness={0.9} metalness={0.1} />
      </mesh>

      {/* Left Wall */}
      <mesh position={[-5, 2.5, -length / 2 + 5]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[length, 5]} />
        <meshStandardMaterial color="#0a0a0a" roughness={0.5} metalness={0.5} />
      </mesh>

      {/* Right Wall */}
      <mesh position={[5, 2.5, -length / 2 + 5]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[length, 5]} />
        <meshStandardMaterial color="#0a0a0a" roughness={0.5} metalness={0.5} />
      </mesh>
      
      {/* Grid Helpers for holographic feel */}
      <gridHelper args={[10, length, '#00ffcc', '#003322']} position={[0, 0.01, -length / 2 + 5]} rotation={[0, 0, 0]} />
      <gridHelper args={[10, length, '#00ffcc', '#003322']} position={[0, 4.99, -length / 2 + 5]} rotation={[0, 0, 0]} />

      {arches}

      {/* Posters */}
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
  const controlsRef = useRef<any>(null);

  useEffect(() => {
    fetch('/api/movies')
      .then(res => res.json())
      .then(data => setBaseMovies(data.movies || []))
      .catch(err => console.error('Failed to fetch movies', err));
  }, []);

  // Filtering & Sorting State
  const [sortBy, setSortBy] = useState<'popularity' | 'rating' | 'name'>('popularity');
  const [genre, setGenre] = useState<string>('הכל');
  
  // Favorites State
  const [favorites, setFavorites] = useState<number[]>([]);

  // Telegram State
  const [showTgLogin, setShowTgLogin] = useState(false);
  const [showCinemaScreen, setShowCinemaScreen] = useState(false);
  const [tgSearchResults, setTgSearchResults] = useState<any[]>([]);
  const [isSearchingTg, setIsSearchingTg] = useState(false);
  const [tgVideoUrl, setTgVideoUrl] = useState<string | null>(null);
  const [tgSubtitleUrl, setTgSubtitleUrl] = useState<string | null>(null);
  
  const [tgPhone, setTgPhone] = useState('');
  const [tgCode, setTgCode] = useState('');
  const [tgPassword, setTgPassword] = useState('');
  const [tgLoginStep, setTgLoginStep] = useState<'phone' | 'code' | 'password'>('phone');
  const [tgLoginError, setTgLoginError] = useState('');
  const [isTgLoading, setIsTgLoading] = useState(false);

  // TV Mode State
  const [isTvMode, setIsTvMode] = useState(false);
  const [corridorZ, setCorridorZ] = useState(0);
  const [lookDirection, setLookDirection] = useState<'left' | 'right' | 'forward'>('forward');
  const sidebarRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  const toggleFavorite = (id: number) => {
    setFavorites(prev => prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]);
  };

  // Generate "Infinite" Movie List based on filters
  const displayMovies = useMemo(() => {
    let filtered = baseMovies;
    
    // Apply Genre / Category Filter
    if (genre === 'מועדפים') {
      filtered = baseMovies.filter(m => favorites.includes(m.id));
    } else if (genre !== 'הכל' && genre !== 'בלאגן') {
      filtered = baseMovies.filter(m => m.genre === genre);
    }

    let sorted = [...filtered];
    
    // Apply Sorting
    if (genre === 'בלאגן') {
      // Chaos mode: random shuffle, ignore sorting
      sorted.sort(() => Math.random() - 0.5);
    } else {
      if (sortBy === 'rating') sorted.sort((a, b) => b.rating - a.rating);
      else if (sortBy === 'popularity') sorted.sort((a, b) => b.popularity - a.popularity);
      else if (sortBy === 'name') sorted.sort((a, b) => a.title.localeCompare(b.title));
    }

    // Repeat the array 10 times to create an "infinite" corridor feel
    // If filtered is empty, return empty array
    if (sorted.length === 0) return [];
    
    return Array(10).fill(sorted).flat().map((m, i) => ({
      ...m,
      uniqueId: `${m.id}-${i}`
    }));
  }, [baseMovies, sortBy, genre, favorites]);

  const corridorLength = (displayMovies.length / 2) * 5 + 10;

  const handlePosterClick = (movie: any) => {
    setSelectedMovie(movie);
    if (controlsRef.current) {
      controlsRef.current.unlock();
    }
    setIsLocked(false);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        setIsTvMode(true);
      }

      if (isLocked && !selectedMovie && !showTgLogin) {
        if (e.key === 'ArrowUp') {
          setCorridorZ(z => Math.min(z + 1, Math.floor(displayMovies.length / 2)));
          setLookDirection('forward');
        } else if (e.key === 'ArrowDown') {
          setCorridorZ(z => Math.max(z - 1, 0));
          setLookDirection('forward');
        } else if (e.key === 'ArrowLeft') {
          setLookDirection('left');
        } else if (e.key === 'ArrowRight') {
          setLookDirection('right');
        } else if (e.key === 'Enter') {
          if (lookDirection === 'left' || lookDirection === 'right') {
            const isLookingLeft = lookDirection === 'left';
            const index = corridorZ * 2 + (isLookingLeft ? 0 : 1);
            const movie = displayMovies[index];
            if (movie) {
              setSelectedMovie(movie);
              setIsLocked(false);
              document.exitPointerLock?.();
            }
          }
        } else if (e.key === 'Escape' || e.key === 'Backspace') {
          setIsLocked(false);
          document.exitPointerLock?.();
        }
      } else if (selectedMovie && !showTgLogin && !showCinemaScreen) {
        if (e.key === 'Escape' || e.key === 'Backspace') {
          setSelectedMovie(null);
        }
      } else if (showCinemaScreen) {
        if (e.key === 'Escape' || e.key === 'Backspace') {
          if (tgVideoUrl) {
            setTgVideoUrl(null);
          } else {
            setShowCinemaScreen(false);
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isLocked, selectedMovie, showTgLogin, showCinemaScreen, tgVideoUrl, corridorZ, lookDirection, displayMovies]);

  useEffect(() => {
    if (!isLocked && !selectedMovie && sidebarRef.current) {
      const firstBtn = sidebarRef.current.querySelector('button');
      firstBtn?.focus();
    }
  }, [isLocked, selectedMovie]);

  useEffect(() => {
    if (selectedMovie && modalRef.current) {
      const firstBtn = modalRef.current.querySelector('button');
      firstBtn?.focus();
    }
  }, [selectedMovie]);

  const handleCloseModal = () => {
    setSelectedMovie(null);
  };

  const handleTelegramSearch = async () => {
    try {
      setIsSearchingTg(true);
      const res = await fetch('/api/tg/status');
      const data = await res.json();
      
      if (!data.loggedIn) {
        setShowTgLogin(true);
        setIsSearchingTg(false);
        return;
      }

      // Logged in, perform search
      setShowCinemaScreen(true);
      setTgSearchResults([]);
      setTgVideoUrl(null);
      
      const searchRes = await fetch(`/api/tg/search?query=${encodeURIComponent(selectedMovie.title)}`);
      const searchData = await searchRes.json();
      
      if (searchData.error) throw new Error(searchData.error);
      setTgSearchResults(searchData.results || []);
    } catch (e: any) {
      console.error(e);
      alert('Error connecting to Telegram: ' + e.message);
    } finally {
      setIsSearchingTg(false);
    }
  };

  const startTgLogin = async () => {
    setIsTgLoading(true);
    setTgLoginError('');
    try {
      const res = await fetch('/api/tg/startLogin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: tgPhone })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setTgLoginStep('code');
    } catch (e: any) {
      setTgLoginError(e.message);
    } finally {
      setIsTgLoading(false);
    }
  };

  const submitTgCode = async () => {
    setIsTgLoading(true);
    setTgLoginError('');
    try {
      const res = await fetch('/api/tg/submitCode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: tgCode })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      
      // Wait a moment to see if it requires password or succeeds
      setTimeout(async () => {
        const statusRes = await fetch('/api/tg/status');
        const statusData = await statusRes.json();
        if (statusData.loggedIn) {
          setShowTgLogin(false);
          handleTelegramSearch();
        } else {
          setTgLoginStep('password');
        }
        setIsTgLoading(false);
      }, 2000);
    } catch (e: any) {
      setTgLoginError(e.message);
      setIsTgLoading(false);
    }
  };

  const submitTgPassword = async () => {
    setIsTgLoading(true);
    setTgLoginError('');
    try {
      const res = await fetch('/api/tg/submitPassword', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: tgPassword })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      
      setTimeout(async () => {
        const statusRes = await fetch('/api/tg/status');
        const statusData = await statusRes.json();
        if (statusData.loggedIn) {
          setShowTgLogin(false);
          handleTelegramSearch();
        } else {
          setTgLoginError('Login failed. Please check credentials.');
        }
        setIsTgLoading(false);
      }, 2000);
    } catch (e: any) {
      setTgLoginError(e.message);
      setIsTgLoading(false);
    }
  };

  const playTgVideo = async (peerId: string, messageId: number) => {
    setTgVideoUrl(`/api/tg/stream/${peerId}/${messageId}`);
    setTgSubtitleUrl(null); // Reset subtitle

    // Try to find subtitles automatically
    try {
      const subRes = await fetch(`/api/tg/search-subtitles?query=${encodeURIComponent(selectedMovie.title)}`);
      const subData = await subRes.json();
      if (subData.results && subData.results.length > 0) {
        const bestSub = subData.results[0];
        setTgSubtitleUrl(`/api/tg/subtitle/${bestSub.peerId}/${bestSub.id}`);
      }
    } catch (e) {
      console.error('Failed to fetch subtitles', e);
    }
  };

  return (
    <div className="w-full h-screen bg-black overflow-hidden relative font-sans text-white" dir="rtl">
      {/* 3D Canvas */}
      <Canvas camera={{ position: [0, 1.6, 2], fov: 75 }}>
        <color attach="background" args={['#000000']} />
        <fog attach="fog" args={['#000000', 5, 30]} />
        
        <ambientLight intensity={0.5} />
        <directionalLight position={[0, 10, 5]} intensity={1} color="#00ffcc" />
        
        <Suspense fallback={null}>
          <Corridor 
            movies={displayMovies} 
            onPosterClick={handlePosterClick} 
            setHoveredPoster={setHoveredPoster}
            favorites={favorites}
            onToggleFavorite={toggleFavorite}
            isTvMode={isTvMode}
            isLocked={isLocked}
            corridorZ={corridorZ}
            lookDirection={lookDirection}
          />
        </Suspense>

        {!isTvMode && <Player corridorLength={corridorLength} movies={displayMovies} />}
        
        <CameraController isLocked={isLocked} isTvMode={isTvMode} corridorZ={corridorZ} lookDirection={lookDirection} />

        {!isTvMode && (
          <PointerLockControls 
            ref={controlsRef}
            onLock={() => setIsLocked(true)} 
            onUnlock={() => setIsLocked(false)} 
          />
        )}
      </Canvas>

      {/* Crosshair */}
      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none z-10">
        <div className={`w-2 h-2 rounded-full transition-colors duration-200 ${hoveredPoster ? 'bg-[#00ffcc] shadow-[0_0_10px_#00ffcc]' : 'bg-white/50'}`} />
      </div>

      {/* Hover Info (Locked Mode) */}
      <AnimatePresence>
        {hoveredPoster && isLocked && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute bottom-10 left-1/2 transform -translate-x-1/2 pointer-events-none z-10 text-center"
          >
            <div className="bg-black/60 backdrop-blur-md border border-[#00ffcc]/30 px-6 py-3 rounded-full flex flex-col items-center">
              <p className="text-[#00ffcc] font-mono text-sm uppercase tracking-widest">מטרה ננעלה</p>
              <h2 className="text-xl font-bold mt-1">{hoveredPoster.title}</h2>
              <div className="flex items-center gap-3 mt-1 text-sm text-gray-300">
                <span className="flex items-center gap-1"><Star size={14} className="text-yellow-400" /> {hoveredPoster.rating}</span>
                <span>•</span>
                <span>{hoveredPoster.genre}</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* HUD & Filter Menu (Unlocked Mode) */}
      <AnimatePresence>
        {!isLocked && !selectedMovie && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-20 flex"
          >
            {/* Sidebar Menu */}
            <div ref={sidebarRef} className="w-80 h-full bg-black/80 backdrop-blur-xl border-l border-[#00ffcc]/30 p-6 flex flex-col shadow-[-20px_0_50px_rgba(0,0,0,0.5)] overflow-y-auto">
              <div className="flex items-center gap-3 mb-8">
                <Film className="text-[#00ffcc]" size={32} />
                <h1 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-[#00ffcc] to-blue-500">
                  HoloCinema DB
                </h1>
              </div>

              {/* Sort Options */}
              <div className="mb-8">
                <label className="block text-xs font-mono text-[#00ffcc] mb-3 uppercase tracking-widest">מיון לפי</label>
                <div className="flex flex-col gap-2">
                  {[
                    { id: 'popularity', label: 'פופולריות', icon: TrendingUp },
                    { id: 'rating', label: 'דירוג', icon: Star },
                    { id: 'name', label: 'א-ב', icon: Type },
                  ].map(s => (
                    <button
                      key={s.id}
                      onClick={() => setSortBy(s.id as any)}
                      disabled={genre === 'בלאגן'}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl text-right text-sm font-medium transition-all focus:ring-4 focus:ring-[#00ffcc] focus:outline-none ${genre === 'בלאגן' ? 'opacity-50 cursor-not-allowed bg-white/5' : sortBy === s.id ? 'bg-[#00ffcc] text-black shadow-[0_0_15px_rgba(0,255,204,0.4)]' : 'bg-white/5 text-white hover:bg-white/10'}`}
                    >
                      <s.icon size={16} />
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Special Categories */}
              <div className="mb-6">
                <label className="block text-xs font-mono text-[#00ffcc] mb-3 uppercase tracking-widest">מצבים מיוחדים</label>
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => setGenre('מועדפים')}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl text-right text-sm font-medium transition-all focus:ring-4 focus:ring-[#00ffcc] focus:outline-none ${genre === 'מועדפים' ? 'bg-[#ff0055] text-white shadow-[0_0_15px_rgba(255,0,85,0.4)]' : 'bg-white/5 text-white hover:bg-white/10'}`}
                  >
                    <Heart size={16} className={genre === 'מועדפים' ? 'fill-white' : ''} />
                    המועדפים שלי ({favorites.length})
                  </button>
                  <button
                    onClick={() => setGenre('בלאגן')}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl text-right text-sm font-medium transition-all focus:ring-4 focus:ring-[#00ffcc] focus:outline-none ${genre === 'בלאגן' ? 'bg-purple-500 text-white shadow-[0_0_15px_rgba(168,85,247,0.4)]' : 'bg-white/5 text-white hover:bg-white/10'}`}
                  >
                    <Shuffle size={16} />
                    מצב בלאגן (Chaos)
                  </button>
                </div>
              </div>

              {/* Genre Filter */}
              <div className="mb-8">
                <label className="block text-xs font-mono text-[#00ffcc] mb-3 uppercase tracking-widest">סינון ז'אנר</label>
                <div className="flex flex-wrap gap-2">
                  {['הכל', 'ישראלי', 'פעולה', 'מדע בדיוני', 'אנימציה', 'מותחן', 'סרט'].map(g => (
                    <button
                      key={g}
                      onClick={() => setGenre(g)}
                      className={`px-4 py-2 rounded-full text-xs font-medium transition-all focus:ring-4 focus:ring-[#00ffcc] focus:outline-none ${genre === g ? 'bg-[#00ffcc] text-black shadow-[0_0_10px_rgba(0,255,204,0.4)]' : 'bg-white/5 text-white hover:bg-white/10 border border-white/10'}`}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>

              {/* Stats */}
              <div className="mt-auto mb-6 p-4 bg-white/5 rounded-xl border border-white/10">
                <p className="text-xs text-gray-400 font-mono mb-1">סטטוס מסדרון</p>
                <p className="text-sm font-bold text-white">{displayMovies.length} הולוגרמות נטענו</p>
              </div>

              <button 
                onClick={() => {
                  setIsLocked(true);
                  if (!isTvMode) controlsRef.current?.lock();
                }}
                className="w-full py-4 bg-[#00ffcc] hover:bg-[#00ccaa] text-black font-bold rounded-xl transition-all hover:shadow-[0_0_20px_#00ffcc] uppercase tracking-wider shrink-0 focus:ring-4 focus:ring-white focus:outline-none"
              >
                היכנס למסדרון
              </button>
            </div>

            {/* Click to enter overlay */}
            <div 
              className="flex-1 bg-black/20 backdrop-blur-sm flex items-center justify-center cursor-pointer group"
              onClick={() => {
                setIsLocked(true);
                if (!isTvMode) controlsRef.current?.lock();
              }}
            >
              <div className="bg-black/60 px-8 py-4 rounded-full border border-[#00ffcc]/30 text-[#00ffcc] font-mono tracking-widest group-hover:bg-[#00ffcc]/10 transition-colors shadow-[0_0_30px_rgba(0,255,204,0.1)]">
                {isTvMode ? 'לחץ ENTER כדי להמשיך' : 'לחץ כדי להמשיך'}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Movie Modal */}
      <AnimatePresence>
        {selectedMovie && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="absolute inset-0 z-30 flex items-center justify-center p-4 md:p-12"
          >
            <div className="absolute inset-0 bg-black/90 backdrop-blur-xl" onClick={handleCloseModal} />
            
            <div ref={modalRef} className="relative w-full max-w-5xl bg-[#0a0a0a] border border-[#00ffcc]/30 rounded-3xl overflow-hidden shadow-[0_0_100px_rgba(0,255,204,0.15)] flex flex-col md:flex-row">
              <button 
                onClick={handleCloseModal}
                className="absolute top-4 right-4 z-10 p-2 bg-black/50 hover:bg-[#00ffcc] hover:text-black rounded-full transition-colors text-white focus:ring-4 focus:ring-[#00ffcc] focus:outline-none"
              >
                <X size={24} />
              </button>

              {/* Poster Side */}
              <div className="w-full md:w-1/3 relative hidden md:block">
                <img 
                  src={selectedMovie.poster} 
                  alt={selectedMovie.title} 
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-transparent to-transparent" />
              </div>

              {/* Content Side */}
              <div className="w-full md:w-2/3 p-6 md:p-10 flex flex-col">
                <div className="flex items-center gap-3 mb-2">
                  <span className="px-3 py-1 bg-[#00ffcc]/10 text-[#00ffcc] border border-[#00ffcc]/20 rounded-full text-xs font-mono uppercase tracking-wider">
                    {selectedMovie.genre}
                  </span>
                  <span className="flex items-center gap-1 text-yellow-400 text-sm font-bold">
                    <Star size={16} fill="currentColor" />
                    {selectedMovie.rating}
                  </span>
                  {favorites.includes(selectedMovie.id) && (
                    <span className="flex items-center gap-1 text-[#ff0055] text-sm font-bold mr-auto">
                      <Heart size={16} fill="currentColor" />
                      מועדף
                    </span>
                  )}
                </div>
                
                <h2 className="text-3xl md:text-5xl font-bold mb-4">{selectedMovie.title}</h2>
                <p className="text-gray-400 mb-8 leading-relaxed text-lg">
                  {selectedMovie.desc}
                </p>

                {/* Trailer Video */}
                <div className="mt-auto relative w-full aspect-video rounded-xl overflow-hidden border border-white/10 bg-black group">
                  {selectedMovie.trailer ? (
                    <iframe 
                      src={`${selectedMovie.trailer}?autoplay=0&controls=1&rel=0`}
                      title={`${selectedMovie.title} Trailer`}
                      className="w-full h-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-500">
                      אין טריילר זמין
                    </div>
                  )}
                </div>
                
                <div className="mt-6 flex gap-4">
                  <button 
                    onClick={() => toggleFavorite(selectedMovie.id)}
                    className={`flex-1 py-3 font-bold rounded-xl transition-all flex items-center justify-center gap-2 border focus:ring-4 focus:ring-[#ff0055] focus:outline-none ${favorites.includes(selectedMovie.id) ? 'bg-[#ff0055]/20 text-[#ff0055] border-[#ff0055]/50 hover:bg-[#ff0055]/30' : 'bg-white/5 text-white border-white/10 hover:bg-white/10'}`}
                  >
                    <Heart size={20} fill={favorites.includes(selectedMovie.id) ? "currentColor" : "none"} />
                    {favorites.includes(selectedMovie.id) ? 'הסר ממועדפים' : 'הוסף למועדפים'}
                  </button>
                  <button 
                    onClick={handleTelegramSearch}
                    disabled={isSearchingTg}
                    className="flex-1 py-3 bg-[#2AABEE] hover:bg-[#229ED9] text-white font-bold rounded-xl transition-all hover:shadow-[0_0_20px_#2AABEE] flex items-center justify-center gap-2 disabled:opacity-50 focus:ring-4 focus:ring-white focus:outline-none"
                  >
                    {isSearchingTg ? <Loader2 className="animate-spin" size={20} /> : (
                      <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.19-.08-.05-.19-.02-.27 0-.12.03-1.96 1.25-5.54 3.67-.52.36-1 .53-1.42.52-.47-.01-1.37-.26-2.03-.48-.82-.27-1.47-.42-1.42-.88.03-.24.29-.48.79-.74 3.08-1.34 5.15-2.23 6.19-2.66 2.95-1.23 3.56-1.44 3.96-1.45.09 0 .28.02.41.11.11.08.14.19.15.27-.01.04.01.12 0 .2z"/>
                      </svg>
                    )}
                    חפש וצפה בטלגרם
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Telegram Login Modal */}
      <AnimatePresence>
        {showTgLogin && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md"
          >
            <div className="bg-[#111] border border-[#2AABEE]/30 p-8 rounded-2xl max-w-md w-full shadow-[0_0_50px_rgba(42,171,238,0.2)]">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-[#2AABEE] flex items-center gap-2">
                  <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.19-.08-.05-.19-.02-.27 0-.12.03-1.96 1.25-5.54 3.67-.52.36-1 .53-1.42.52-.47-.01-1.37-.26-2.03-.48-.82-.27-1.47-.42-1.42-.88.03-.24.29-.48.79-.74 3.08-1.34 5.15-2.23 6.19-2.66 2.95-1.23 3.56-1.44 3.96-1.45.09 0 .28.02.41.11.11.08.14.19.15.27-.01.04.01.12 0 .2z"/></svg>
                  התחברות לטלגרם
                </h2>
                <button onClick={() => setShowTgLogin(false)} className="text-gray-400 hover:text-white focus:ring-2 focus:ring-[#2AABEE] focus:outline-none rounded-full p-1"><X /></button>
              </div>

              {tgLoginError && <div className="bg-red-500/20 text-red-400 p-3 rounded-lg mb-4 text-sm">{tgLoginError}</div>}

              {tgLoginStep === 'phone' && (
                <div>
                  <label className="block text-sm text-gray-400 mb-2">מספר טלפון (כולל קידומת)</label>
                  <div className="relative">
                    <Phone className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500" size={18} />
                    <input 
                      type="text" placeholder="+972501234567" value={tgPhone} onChange={e => setTgPhone(e.target.value)}
                      className="w-full bg-black border border-gray-700 rounded-xl py-3 pr-10 pl-4 text-white focus:border-[#2AABEE] focus:ring-2 focus:ring-[#2AABEE] outline-none text-left" dir="ltr"
                    />
                  </div>
                  <button onClick={startTgLogin} disabled={isTgLoading || !tgPhone} className="w-full mt-6 py-3 bg-[#2AABEE] text-white font-bold rounded-xl hover:bg-[#229ED9] disabled:opacity-50 flex justify-center focus:ring-4 focus:ring-white focus:outline-none">
                    {isTgLoading ? <Loader2 className="animate-spin" /> : 'שלח קוד'}
                  </button>
                </div>
              )}

              {tgLoginStep === 'code' && (
                <div>
                  <label className="block text-sm text-gray-400 mb-2">קוד אימות (נשלח לטלגרם)</label>
                  <div className="relative">
                    <Key className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500" size={18} />
                    <input 
                      type="text" placeholder="12345" value={tgCode} onChange={e => setTgCode(e.target.value)}
                      className="w-full bg-black border border-gray-700 rounded-xl py-3 pr-10 pl-4 text-white focus:border-[#2AABEE] focus:ring-2 focus:ring-[#2AABEE] outline-none text-left" dir="ltr"
                    />
                  </div>
                  <button onClick={submitTgCode} disabled={isTgLoading || !tgCode} className="w-full mt-6 py-3 bg-[#2AABEE] text-white font-bold rounded-xl hover:bg-[#229ED9] disabled:opacity-50 flex justify-center focus:ring-4 focus:ring-white focus:outline-none">
                    {isTgLoading ? <Loader2 className="animate-spin" /> : 'אמת קוד'}
                  </button>
                </div>
              )}

              {tgLoginStep === 'password' && (
                <div>
                  <label className="block text-sm text-gray-400 mb-2">סיסמת אימות דו-שלבי</label>
                  <div className="relative">
                    <Lock className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500" size={18} />
                    <input 
                      type="password" placeholder="סיסמה" value={tgPassword} onChange={e => setTgPassword(e.target.value)}
                      className="w-full bg-black border border-gray-700 rounded-xl py-3 pr-10 pl-4 text-white focus:border-[#2AABEE] focus:ring-2 focus:ring-[#2AABEE] outline-none text-left" dir="ltr"
                    />
                  </div>
                  <button onClick={submitTgPassword} disabled={isTgLoading || !tgPassword} className="w-full mt-6 py-3 bg-[#2AABEE] text-white font-bold rounded-xl hover:bg-[#229ED9] disabled:opacity-50 flex justify-center focus:ring-4 focus:ring-white focus:outline-none">
                    {isTgLoading ? <Loader2 className="animate-spin" /> : 'שלח סיסמה'}
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Cinema Screen Modal for Telegram Results */}
      <AnimatePresence>
        {showCinemaScreen && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
            className="absolute inset-0 z-40 flex items-center justify-center p-4 md:p-8 bg-black/95"
          >
            <div className="w-full h-full max-w-7xl flex flex-col relative">
              <button 
                onClick={() => { setShowCinemaScreen(false); setTgVideoUrl(null); }}
                className="absolute top-0 right-0 z-50 p-3 bg-white/10 hover:bg-red-500 rounded-full transition-colors"
              >
                <X size={24} />
              </button>

              <div className="text-center mb-6">
                <h2 className="text-3xl font-bold text-[#2AABEE] uppercase tracking-widest">מסך קולנוע: {selectedMovie?.title}</h2>
                <p className="text-gray-400">מקורות צפייה מקבוצות הטלגרם שלך</p>
              </div>

              {/* Main Screen Area */}
              <div className="flex-1 bg-[#050505] border-2 border-[#2AABEE]/30 rounded-3xl overflow-hidden shadow-[0_0_100px_rgba(42,171,238,0.15)] flex flex-col relative">
                
                {/* Video Player or Results List */}
                {tgVideoUrl ? (
                  <div className="w-full h-full relative">
                    <video 
                      src={tgVideoUrl} 
                      controls 
                      autoPlay 
                      crossOrigin="anonymous"
                      className="w-full h-full object-contain"
                    >
                      {tgSubtitleUrl && (
                        <track 
                          kind="subtitles" 
                          src={tgSubtitleUrl} 
                          srcLang="he" 
                          label="עברית" 
                          default 
                        />
                      )}
                    </video>
                    <button 
                      onClick={() => setTgVideoUrl(null)}
                      className="absolute top-4 right-4 px-4 py-2 bg-black/50 hover:bg-white/20 rounded-lg backdrop-blur-md transition-colors focus:ring-4 focus:ring-white focus:outline-none"
                    >
                      → חזרה לתוצאות
                    </button>
                  </div>
                ) : (
                  <div className="p-6 overflow-y-auto h-full">
                    {isSearchingTg ? (
                      <div className="flex flex-col items-center justify-center h-full text-[#2AABEE]">
                        <Loader2 className="animate-spin w-16 h-16 mb-4" />
                        <p className="text-xl animate-pulse">סורק את מאגר הטלגרם...</p>
                      </div>
                    ) : tgSearchResults.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full text-gray-500">
                        <Search className="w-16 h-16 mb-4 opacity-50" />
                        <p className="text-xl">לא נמצאו מקורות וידאו עבור סרט זה.</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {tgSearchResults.map((res, idx) => (
                          <button 
                            key={idx} 
                            onClick={() => playTgVideo(res.peerId, res.id)}
                            className="bg-white/5 border border-white/10 hover:border-[#2AABEE] p-4 rounded-xl cursor-pointer transition-all hover:bg-white/10 group focus:ring-4 focus:ring-[#2AABEE] focus:outline-none text-right w-full"
                          >
                            <div className="flex items-start gap-4">
                              <div className="w-12 h-12 rounded-lg bg-[#2AABEE]/20 flex items-center justify-center shrink-0 group-hover:bg-[#2AABEE] transition-colors">
                                <Play className="text-[#2AABEE] group-hover:text-white" fill="currentColor" />
                              </div>
                              <div className="flex-1 min-w-0 text-right">
                                <h3 className="font-bold text-white truncate" dir="ltr">{res.title}</h3>
                                <p className="text-sm text-gray-400 truncate mt-1">מאת: {res.chatName}</p>
                                <div className="flex items-center justify-end gap-3 mt-2 text-xs text-gray-500 font-mono">
                                  <span>{res.size}</span>
                                  <span>•</span>
                                  <span>{new Date(res.date * 1000).toLocaleDateString()}</span>
                                </div>
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
