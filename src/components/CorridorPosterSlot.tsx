import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { textureManager } from '../utils/TextureManager';
import type { WatchStatus } from '../utils/mediaState';
import type { CorridorItem } from '../utils/contentModel';
import type { PosterSlot, PosterTextureIntent, PosterTextureState } from '../utils/corridorScene';

type CorridorPosterSlotProps = {
  slot: PosterSlot<CorridorItem>;
  textureIntent: PosterTextureIntent;
  isFocused: boolean;
  isFavorited: boolean;
  watchStatus: WatchStatus;
  onTextureStateChange?: (slotId: string, state: PosterTextureState) => void;
};

const getCardPalette = (item: CorridorItem | null) => {
  const seed = `${item?.mediaType ?? 'movie'}:${item?.title ?? 'poster'}:${item?.year ?? 0}`;
  let hash = 19;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 33 + seed.charCodeAt(index)) >>> 0;
  }
  const hue = hash % 360;
  return {
    base: `hsl(${hue} 34% 16%)`,
    accent: `hsl(${(hue + 28) % 360} 84% 66%)`,
    accentSoft: `hsla(${(hue + 28) % 360} 84% 66% / 0.24)`
  };
};

export const CorridorPosterSlot = ({
  slot,
  textureIntent,
  isFocused,
  isFavorited,
  watchStatus,
  onTextureStateChange
}: CorridorPosterSlotProps) => {
  const groupRef = useRef<THREE.Group>(null);
  const requestTokenRef = useRef(0);
  const activeTextureUrlRef = useRef<string | null>(null);
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  const [textureState, setTextureState] = useState<PosterTextureState>('empty');
  const item = slot.item;
  const thumbUrl = item?.posterThumb || item?.poster || '';
  const fullUrl = item?.poster || thumbUrl;
  const cardPalette = useMemo(() => getCardPalette(item), [item]);

  useEffect(() => {
    onTextureStateChange?.(slot.slotId, textureState);
  }, [onTextureStateChange, slot.slotId, textureState]);

  const releaseActiveTexture = useCallback(() => {
    if (!activeTextureUrlRef.current) return;
    textureManager.releaseTexture(activeTextureUrlRef.current);
    activeTextureUrlRef.current = null;
  }, []);

  const applyTexture = useCallback((nextUrl: string, nextTexture: THREE.Texture, nextState: PosterTextureState) => {
    if (!nextUrl) return;
    if (activeTextureUrlRef.current !== nextUrl) {
      releaseActiveTexture();
      textureManager.retainTexture(nextUrl);
      activeTextureUrlRef.current = nextUrl;
    }
    setTexture(nextTexture);
    setTextureState(nextState);
  }, [releaseActiveTexture]);

  const resetTextureState = useCallback((nextState: PosterTextureState) => {
    releaseActiveTexture();
    setTexture(null);
    setTextureState(nextState);
  }, [releaseActiveTexture]);

  useEffect(() => () => releaseActiveTexture(), [releaseActiveTexture]);

  useEffect(() => {
    requestTokenRef.current += 1;

    if (!item) {
      resetTextureState('empty');
      return;
    }

    const cachedFull = fullUrl ? textureManager.getTexture(fullUrl) : null;
    const cachedThumb = thumbUrl ? textureManager.getTexture(thumbUrl) : null;
    if (cachedFull) {
      applyTexture(fullUrl, cachedFull, 'full');
      return;
    }
    if (cachedThumb) {
      applyTexture(thumbUrl || fullUrl, cachedThumb, thumbUrl === fullUrl ? 'full' : 'thumb');
      return;
    }

    resetTextureState('empty');
  }, [applyTexture, fullUrl, item, resetTextureState, slot.slotId, thumbUrl]);

  useEffect(() => {
    if (!item) return;
    const requestToken = ++requestTokenRef.current;
    let cancelled = false;

    const applyLoadedTexture = (nextUrl: string, nextTexture: THREE.Texture, nextState: PosterTextureState) => {
      if (cancelled || requestToken !== requestTokenRef.current) return;
      applyTexture(nextUrl, nextTexture, nextState);
    };

    const markFailed = () => {
      if (cancelled || requestToken !== requestTokenRef.current) return;
      if (!activeTextureUrlRef.current) {
        setTextureState('failed');
      }
    };

    const loadThumbThenFull = async () => {
      const desiredThumbUrl = thumbUrl || fullUrl;
      const desiredFullUrl = fullUrl || desiredThumbUrl;

      try {
        if (desiredThumbUrl && !textureManager.getTexture(desiredThumbUrl)) {
          const thumbTexture = await textureManager.loadTexture(desiredThumbUrl);
          applyLoadedTexture(desiredThumbUrl, thumbTexture, desiredThumbUrl === desiredFullUrl ? 'full' : 'thumb');
        } else if (desiredThumbUrl) {
          const cachedTexture = textureManager.getTexture(desiredThumbUrl);
          if (cachedTexture) {
            applyLoadedTexture(desiredThumbUrl, cachedTexture, desiredThumbUrl === desiredFullUrl ? 'full' : 'thumb');
          }
        }
      } catch {
        if (textureIntent === 'thumb' || !desiredFullUrl || desiredFullUrl === desiredThumbUrl) {
          markFailed();
          return;
        }
      }

      if (textureIntent !== 'full' || !desiredFullUrl || desiredFullUrl === desiredThumbUrl) {
        return;
      }

      try {
        const fullTexture = textureManager.getTexture(desiredFullUrl) || await textureManager.loadTexture(desiredFullUrl);
        applyLoadedTexture(desiredFullUrl, fullTexture, 'full');
      } catch {
        if (!activeTextureUrlRef.current) {
          markFailed();
        }
      }
    };

    void loadThumbThenFull();

    return () => {
      cancelled = true;
    };
  }, [applyTexture, fullUrl, item, textureIntent, thumbUrl]);

  useFrame((state) => {
    if (!groupRef.current) return;
    const zDelta = state.camera.position.z - slot.position[2];
    const isVisible = zDelta > -14 && zDelta < 42;
    groupRef.current.visible = Boolean(item) && isVisible;

    const targetScale = isFocused ? 1.08 : 1;
    groupRef.current.scale.lerp(new THREE.Vector3(targetScale, targetScale, 1), 0.12);
  });

  if (!item) {
    return null;
  }

  const showBadgePill = isFocused && (isFavorited || watchStatus !== 'unwatched');
  const watchColor = watchStatus === 'watched' ? '#34d399' : watchStatus === 'in_progress' ? '#fbbf24' : '#7debd6';

  return (
    <group ref={groupRef} position={slot.position} rotation={slot.rotation}>
      <mesh position={[0, 0, -0.08]}>
        <planeGeometry args={[2.78, 4.06]} />
        <meshStandardMaterial color="#071019" metalness={0.28} roughness={0.78} />
      </mesh>

      <mesh position={[0, 0, -0.01]}>
        <planeGeometry args={[2.68, 3.96]} />
        <meshStandardMaterial color="#0d1922" metalness={0.34} roughness={0.42} emissive="#08161d" emissiveIntensity={0.34} />
      </mesh>

      <mesh name="poster_mesh" userData={{ uniqueId: item.uniqueId }} position={[0, 0, 0.02]}>
        <planeGeometry args={[2.52, 3.8]} />
        <meshBasicMaterial
          color={texture ? '#ffffff' : cardPalette.base}
          map={texture ?? undefined}
          transparent={false}
          toneMapped={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      {!texture && (
        <>
          <mesh position={[0, 1.2, 0.04]}>
            <planeGeometry args={[1.86, 0.12]} />
            <meshBasicMaterial color={cardPalette.accent} transparent opacity={0.9} />
          </mesh>
          <mesh position={[0, -1.16, 0.04]}>
            <planeGeometry args={[1.46, 0.08]} />
            <meshBasicMaterial color={cardPalette.accent} transparent opacity={0.48} />
          </mesh>
          <mesh position={[0, -1.45, 0.04]}>
            <planeGeometry args={[1.08, 0.06]} />
            <meshBasicMaterial color={cardPalette.accentSoft} transparent opacity={0.9} />
          </mesh>
        </>
      )}

      <mesh position={[0, 2.02, 0.05]}>
        <planeGeometry args={[2.34, 0.08]} />
        <meshBasicMaterial color={isFocused ? '#7debd6' : '#22313d'} transparent opacity={isFocused ? 0.92 : 0.46} />
      </mesh>

      {showBadgePill && (
        <mesh position={[-0.88, 1.74, 0.08]}>
          <planeGeometry args={[0.56, 0.22]} />
          <meshBasicMaterial color={watchColor} transparent opacity={0.88} />
        </mesh>
      )}

      {isFocused && (
        <mesh name="heart_mesh" userData={{ uniqueId: item.uniqueId }} position={[0.98, 1.72, 0.08]}>
          <circleGeometry args={[0.18, 18]} />
          <meshBasicMaterial color={isFavorited ? '#ff517b' : '#7debd6'} transparent opacity={0.9} />
        </mesh>
      )}

      {isFocused && (
        <>
          <mesh position={[-1.32, 0, 0.03]}>
            <planeGeometry args={[0.05, 3.3]} />
            <meshBasicMaterial color="#7debd6" transparent opacity={0.32} />
          </mesh>
          <mesh position={[1.32, 0, 0.03]}>
            <planeGeometry args={[0.05, 3.3]} />
            <meshBasicMaterial color="#7debd6" transparent opacity={0.32} />
          </mesh>
        </>
      )}
    </group>
  );
};
