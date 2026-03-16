import React, { useMemo } from 'react';
import {
  CORRIDOR_INITIAL_CAMERA_Z,
  CORRIDOR_POSTER_PAIR_SPACING
} from '../utils/corridorEngine';
import {
  getShellDepthRange,
  getShellPairIndices,
  type CorridorShellConfig,
  type CorridorTierConfig
} from '../utils/corridorScene';

type CorridorShellProps = {
  cameraZ: number;
  config: CorridorShellConfig;
  tierConfig: CorridorTierConfig;
};

const CorridorSection = ({
  pairIndex,
  config
}: {
  pairIndex: number;
  config: CorridorShellConfig;
}) => {
  const z = -pairIndex * CORRIDOR_POSTER_PAIR_SPACING - CORRIDOR_INITIAL_CAMERA_Z;
  const sidePanels = [
    { key: 'left', x: -config.sideWallX, rotationY: Math.PI / 2 },
    { key: 'right', x: config.sideWallX, rotationY: -Math.PI / 2 }
  ] as const;

  return (
    <group position={[0, 0, z]}>
      {sidePanels.map((panel) => (
        <React.Fragment key={`${pairIndex}:${panel.key}`}>
          <mesh position={[panel.x, config.wallHeight / 2, 0]} rotation={[0, panel.rotationY, 0]}>
            <planeGeometry args={[config.wallHeight - 0.6, CORRIDOR_POSTER_PAIR_SPACING]} />
            <meshStandardMaterial color={config.palette.wall} metalness={0.28} roughness={0.84} />
          </mesh>
          <mesh position={[panel.x * 0.985, 3.18, 0]} rotation={[0, panel.rotationY, 0]}>
            <planeGeometry args={[config.bayWidth + 0.55, config.bayHeight + 0.55]} />
            <meshStandardMaterial color={config.palette.frame} metalness={0.46} roughness={0.44} />
          </mesh>
          <mesh position={[panel.x * 0.972, 3.18, 0.02]} rotation={[0, panel.rotationY, 0]}>
            <planeGeometry args={[config.bayWidth + 0.16, config.bayHeight + 0.16]} />
            <meshStandardMaterial color={config.palette.bayBack} metalness={0.12} roughness={0.92} />
          </mesh>
          <mesh position={[panel.x * 0.97, 5.5, 0.04]} rotation={[0, panel.rotationY, 0]}>
            <planeGeometry args={[config.bayWidth + 0.9, config.lightStripWidth]} />
            <meshBasicMaterial color={config.palette.accent} transparent opacity={0.7} />
          </mesh>
          <mesh position={[panel.x * 0.97, 0.95, 0.04]} rotation={[0, panel.rotationY, 0]}>
            <planeGeometry args={[config.bayWidth + 0.9, config.lightStripWidth]} />
            <meshBasicMaterial color={config.palette.accent} transparent opacity={0.24} />
          </mesh>
          <mesh position={[panel.x * 0.975, config.ceilingY - 0.4, 0]} rotation={[0, panel.rotationY, 0]}>
            <planeGeometry args={[0.22, CORRIDOR_POSTER_PAIR_SPACING]} />
            <meshBasicMaterial color={config.palette.accent} transparent opacity={0.18} />
          </mesh>
        </React.Fragment>
      ))}
    </group>
  );
};

export const CorridorShell = ({ cameraZ, config, tierConfig }: CorridorShellProps) => {
  const pairIndices = useMemo(
    () => getShellPairIndices(cameraZ, tierConfig),
    [cameraZ, tierConfig]
  );

  const depthRange = useMemo(() => getShellDepthRange(pairIndices), [pairIndices]);
  const runnerZ = depthRange.centerZ;

  return (
    <group>
      <color attach="background" args={[config.palette.background]} />
      <fog attach="fog" args={[config.palette.haze, tierConfig.fogNear, tierConfig.fogFar]} />

      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, config.floorInset, runnerZ]}
      >
        <planeGeometry args={[config.width, depthRange.depth]} />
        <meshStandardMaterial color={config.palette.floor} metalness={0.18} roughness={0.72} />
      </mesh>

      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, config.floorInset + 0.012, runnerZ]}
      >
        <planeGeometry args={[config.runnerWidth, depthRange.depth]} />
        <meshStandardMaterial color={config.palette.floorRunner} metalness={0.24} roughness={0.4} />
      </mesh>

      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, config.floorInset + 0.016, runnerZ]}
      >
        <planeGeometry args={[0.18, depthRange.depth]} />
        <meshBasicMaterial color={config.palette.accent} transparent opacity={0.42} />
      </mesh>

      <mesh position={[-config.sideWallX, config.wallHeight / 2, runnerZ]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[config.wallHeight, depthRange.depth]} />
        <meshStandardMaterial color={config.palette.wall} metalness={0.34} roughness={0.8} />
      </mesh>

      <mesh position={[config.sideWallX, config.wallHeight / 2, runnerZ]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[config.wallHeight, depthRange.depth]} />
        <meshStandardMaterial color={config.palette.wall} metalness={0.34} roughness={0.8} />
      </mesh>

      <mesh position={[0, config.ceilingY, runnerZ]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[config.width, depthRange.depth]} />
        <meshStandardMaterial color={config.palette.ceiling} metalness={0.18} roughness={0.86} />
      </mesh>

      {pairIndices.map((pairIndex) => (
        <CorridorSection key={`section:${pairIndex}`} pairIndex={pairIndex} config={config} />
      ))}

      <mesh position={[0, 4.4, depthRange.endZ - CORRIDOR_POSTER_PAIR_SPACING * 0.8]}>
        <planeGeometry args={[6.4, 4.6]} />
        <meshBasicMaterial color={config.palette.accent} transparent opacity={0.1} />
      </mesh>

      <mesh position={[0, 1.3, depthRange.endZ - CORRIDOR_POSTER_PAIR_SPACING * 0.45]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[config.runnerWidth * 0.92, 2.2]} />
        <meshBasicMaterial color={config.palette.accent} transparent opacity={0.18} />
      </mesh>
    </group>
  );
};
