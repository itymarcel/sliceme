import React, { useEffect, useState, useRef, useMemo, useCallback, useImperativeHandle, forwardRef } from 'react';
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber';
import { OrbitControls, Line } from '@react-three/drei';
import { parseGeometry } from '../lib/geometryParserClient';
import { Box3, BufferGeometry, BufferAttribute, DirectionalLight, DoubleSide, Euler, Matrix4, Plane, Vector2, Vector3, Raycaster } from 'three';
import type { Rotation, Scale, SlicerModel } from '../types';
import { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { closestSnapCandidate, type MeasurementPoint } from '../lib/measurement';
import { modelMaterialAppearance } from '../lib/modelAppearance';
import { flatSurfaceCandidates, surfaceDownRotation, type FlatSurfaceCandidate, type ModelBounds } from '../lib/objectTools';

const DEG2RAD = Math.PI / 180;
const GROUND_PLANE = new Plane(new Vector3(0, 0, 1), 0);
const DEFAULT_BUILD_VOLUME = { x: 250, y: 210, z: 100 };

type StartPosition = { x: number; y: number };

export type FileRotation = { x: number; y: number; z: number };
export type FilePosition = { x: number; y: number; z?: number };
export type BuildVolume = { x: number; y: number; z: number };

const ZUpCamera: React.FC<{ buildVolume: BuildVolume }> = ({ buildVolume }) => {
  const { camera, invalidate } = useThree();
  const { x, y } = buildVolume;
  useEffect(() => {
    camera.up.set(0, 0, 1);
    camera.lookAt(x / 2, y / 2, 0);
    invalidate();
  }, [x, y, camera, invalidate]);
  return null;
};

const SceneLight: React.FC<{ buildVolume: BuildVolume }> = ({ buildVolume }) => {
  const lightRef = useRef<DirectionalLight | null>(null);

  useEffect(() => {
    if (!lightRef.current) return;
    lightRef.current.target.position.set(buildVolume.x / 2, buildVolume.y / 2, 0);
    lightRef.current.target.updateMatrixWorld();
  }, [buildVolume]);

  return (
    <directionalLight
      ref={lightRef}
      position={[buildVolume.x / 2 - 140, buildVolume.y / 2 - 140, Math.max(320, buildVolume.z + 220)]}
      intensity={1.8}
      castShadow
      shadow-mapSize-width={2048}
      shadow-mapSize-height={2048}
      shadow-radius={10}
      shadow-bias={-0.0004}
      shadow-camera-near={1}
      shadow-camera-far={700}
      shadow-camera-left={-180}
      shadow-camera-right={180}
      shadow-camera-top={180}
      shadow-camera-bottom={-180}
    />
  );
};

type SlicerStlMeshProps = {
  file: SlicerModel;
  selected: boolean;
  position: FilePosition;
  rotation: FileRotation;
  scale: Scale;
  buildVolume: BuildVolume;
  onSelect: (additive: boolean) => void;
  onDragStart: () => void;
  onPositionChange: (x: number, y: number) => void;
  setOrbitEnabled: (enabled: boolean) => void;
  onGeometryLoaded: (fileId: string, geometry: BufferGeometry) => void;
  seamPickActive?: boolean;
  measurementActive?: boolean;
  onMeasurementPoint?: (point: MeasurementPoint) => void;
  onSnapHover?: (point: MeasurementPoint | null) => void;
  surfaceSelectionActive?: boolean;
  onSurfaceSelected?: (rotation: Rotation) => void;
  xray?: boolean;
};

const SurfaceChoice: React.FC<{
  source: BufferGeometry;
  candidate: FlatSurfaceCandidate;
  hovered: boolean;
  onHover: (hovered: boolean) => void;
  onSelect: () => void;
}> = ({ source, candidate, hovered, onHover, onSelect }) => {
  const pointerDown = useRef<{ x: number; y: number } | null>(null);
  const geometry = useMemo(() => {
    const positions = source.getAttribute('position');
    const indices = source.index;
    const values: number[] = [];
    candidate.triangleIndices.forEach((faceIndex) => {
      for (let corner = 0; corner < 3; corner += 1) {
        const elementIndex = faceIndex * 3 + corner;
        const vertexIndex = indices ? indices.getX(elementIndex) : elementIndex;
        values.push(positions.getX(vertexIndex), positions.getY(vertexIndex), positions.getZ(vertexIndex));
      }
    });
    const result = new BufferGeometry();
    result.setAttribute('position', new BufferAttribute(new Float32Array(values), 3));
    return result;
  }, [candidate, source]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh
      geometry={geometry}
      renderOrder={15}
      onPointerDown={(event) => {
        event.stopPropagation();
        pointerDown.current = { x: event.clientX, y: event.clientY };
      }}
      onPointerOver={(event) => { event.stopPropagation(); onHover(true); }}
      onPointerOut={() => onHover(false)}
      onPointerUp={(event) => {
        event.stopPropagation();
        if (!pointerDown.current) return;
        const dx = event.clientX - pointerDown.current.x;
        const dy = event.clientY - pointerDown.current.y;
        pointerDown.current = null;
        if (dx * dx + dy * dy < 25) onSelect();
      }}
    >
      <meshBasicMaterial color={hovered ? '#b8ff73' : '#59d8ff'} transparent opacity={hovered ? 0.72 : 0.24} side={DoubleSide} depthWrite={false} polygonOffset polygonOffsetFactor={-2} />
    </mesh>
  );
};

const SlicerStlMesh: React.FC<SlicerStlMeshProps> = ({
  file, selected, position, rotation, scale, buildVolume, onSelect, onDragStart, onPositionChange, setOrbitEnabled, onGeometryLoaded,
  seamPickActive = false, measurementActive = false, onMeasurementPoint, onSnapHover,
  surfaceSelectionActive = false, onSurfaceSelected, xray = false,
}) => {
  const [geometry, setGeometry] = useState<BufferGeometry | undefined>(undefined);
  const [hoveredSurface, setHoveredSurface] = useState<number | null>(null);
  const { camera, gl, invalidate } = useThree();

  // Compute how far the mesh must be lifted in Z so that the lowest rotated point
  // sits exactly on the build plate (z=0). Recomputes whenever rotation changes,
  // which auto-grounds the object after any X/Y tilt.
  const zLift = useMemo(() => {
    if (!geometry?.boundingBox) return 0;
    const euler = new Euler(rotation.x * DEG2RAD, rotation.y * DEG2RAD, rotation.z * DEG2RAD);
    const matrix = new Matrix4().makeRotationFromEuler(euler).scale(new Vector3(scale.x, scale.y, scale.z));
    const rotatedBox = geometry.boundingBox.clone().applyMatrix4(matrix);
    return -rotatedBox.min.z;
  }, [geometry, rotation, scale]);
  const dragState = useRef({ active: false, offsetX: 0, offsetY: 0 });
  const pointerMoved = useRef(false);
  const pointerDownClient = useRef<{ x: number; y: number } | null>(null);
  const surfaces = useMemo(() => {
    if (!surfaceSelectionActive || !geometry) return [];
    const positions = geometry.getAttribute('position');
    const candidates = flatSurfaceCandidates(positions.array, geometry.index?.array, scale);
    const largestArea = candidates[0]?.area ?? 0;
    return candidates.filter((candidate, index) => index < 12 || candidate.area >= largestArea * 0.005).slice(0, 64);
  }, [geometry, scale, surfaceSelectionActive]);

  useEffect(() => {
    setHoveredSurface(null);
    if (surfaceSelectionActive) invalidate();
  }, [surfaceSelectionActive, surfaces, invalidate]);

  useEffect(() => {
    if (!file.objectUrl) return;
    let cancelled = false;
    fetch(file.objectUrl)
      .then((res) => res.arrayBuffer())
      .then((buffer) => parseGeometry(buffer, file.fileName, { optimizeForPreview: false }))
      .then((geo) => {
        if (cancelled) return;
        geo.computeBoundingBox();
        geo.center();
        // Keep geometry centered at origin so rotation always pivots around the
        // geometric center. zLift (computed from rotation) raises the mesh so it
        // rests on the build plate.
        setGeometry(geo);
        onGeometryLoaded(file.fileId, geo);
        invalidate();
      })
      .catch((error) => {
        console.error(`Could not render preview for ${file.fileName}`, error);
      });
    return () => { cancelled = true; };
  }, [file.objectUrl]);

  useEffect(() => { invalidate(); }, [rotation, position, scale]);

  if (!geometry) return null;

  const getPlaneHit = (clientX: number, clientY: number): Vector3 | null => {
    const rect = gl.domElement.getBoundingClientRect();
    const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ny = -((clientY - rect.top) / rect.height) * 2 + 1;
    const ray = new Raycaster();
    ray.setFromCamera(new Vector2(nx, ny), camera);
    const target = new Vector3();
    return ray.ray.intersectPlane(GROUND_PLANE, target) ? target : null;
  };

  const getSnapPoint = <T extends MouseEvent | PointerEvent>(e: ThreeEvent<T>): MeasurementPoint | null => {
    if (!e.face) return null;
    const rect = gl.domElement.getBoundingClientRect();
    const positions = geometry.getAttribute('position');
    const candidates = [e.face.a, e.face.b, e.face.c].map((index) => {
      const point = new Vector3().fromBufferAttribute(positions, index);
      e.object.localToWorld(point);
      const projected = point.clone().project(camera);
      return {
        point: { x: point.x, y: point.y, z: point.z },
        screenX: rect.left + (projected.x + 1) * rect.width / 2,
        screenY: rect.top + (1 - projected.y) * rect.height / 2,
      };
    });
    return closestSnapCandidate(candidates, e.nativeEvent.clientX, e.nativeEvent.clientY, 12)?.point ?? null;
  };

  return (
    <>
      <mesh
        geometry={geometry}
        position={[position.x, position.y, zLift + (position.z ?? 0)]}
        rotation={[rotation.x * DEG2RAD, rotation.y * DEG2RAD, rotation.z * DEG2RAD]}
        scale={[scale.x, scale.y, scale.z]}
        castShadow={!xray}
        raycast={surfaceSelectionActive ? () => null : undefined}
      onPointerDown={(e) => {
        if (surfaceSelectionActive) return;
        e.stopPropagation();
        pointerMoved.current = false;
        pointerDownClient.current = { x: e.clientX, y: e.clientY };
        // Only start dragging if the object is already selected.
        // If unselected, orbit controls handle the drag naturally (they receive
        // the DOM event regardless of R3F stopPropagation). onPointerUp below
        // handles click-to-select using a distance check.
        if (!selected || seamPickActive || measurementActive) return;
        const hit = getPlaneHit(e.clientX, e.clientY);
        if (!hit) return;
        dragState.current = { active: true, offsetX: hit.x - position.x, offsetY: hit.y - position.y };
        (e.target as Element).setPointerCapture(e.pointerId);
        setOrbitEnabled(false);
      }}
      onPointerMove={(e) => {
        if (measurementActive) {
          e.stopPropagation();
          onSnapHover?.(getSnapPoint(e));
        }
        if (!dragState.current.active) return;
        const hit = getPlaneHit(e.clientX, e.clientY);
        if (!hit) return;
        if (!pointerMoved.current) onDragStart();
        pointerMoved.current = true;
        const nx = Math.max(0, Math.min(buildVolume.x, hit.x - dragState.current.offsetX));
        const ny = Math.max(0, Math.min(buildVolume.y, hit.y - dragState.current.offsetY));
        onPositionChange(nx, ny);
        invalidate();
      }}
      onPointerUp={(e) => {
        if (measurementActive || surfaceSelectionActive) return;
        if (dragState.current.active) {
          dragState.current.active = false;
          (e.target as Element).releasePointerCapture(e.pointerId);
          setOrbitEnabled(true);
          if (!pointerMoved.current) onSelect(e.nativeEvent.ctrlKey || e.nativeEvent.metaKey || e.nativeEvent.shiftKey);
          return;
        }
        // Unselected path: only select if the pointer barely moved (genuine click,
        // not an orbit drag that happened to end over the mesh).
        if (!selected && pointerDownClient.current) {
          const dx = e.clientX - pointerDownClient.current.x;
          const dy = e.clientY - pointerDownClient.current.y;
          if (dx * dx + dy * dy < 25) onSelect(e.nativeEvent.ctrlKey || e.nativeEvent.metaKey || e.nativeEvent.shiftKey); // < 5 px
        }
      }}
      onClick={(e) => {
        if (!measurementActive || !pointerDownClient.current) return;
        const dx = e.clientX - pointerDownClient.current.x;
        const dy = e.clientY - pointerDownClient.current.y;
        if (dx * dx + dy * dy >= 25) return;
        e.stopPropagation();
        onMeasurementPoint?.(getSnapPoint(e) ?? { x: e.point.x, y: e.point.y, z: e.point.z });
      }}
        onPointerOut={() => { if (measurementActive) onSnapHover?.(null); }}
      >
        <meshStandardMaterial
          {...modelMaterialAppearance(selected, xray, !!file.modifierFor)}
          roughness={0.6}
          metalness={0.1}
        />
      </mesh>
      {surfaceSelectionActive && (
        <group
          position={[position.x, position.y, zLift + (position.z ?? 0)]}
          rotation={[rotation.x * DEG2RAD, rotation.y * DEG2RAD, rotation.z * DEG2RAD]}
          scale={[scale.x, scale.y, scale.z]}
        >
          {surfaces.map((candidate, index) => (
            <SurfaceChoice
              key={candidate.triangleIndices.join('-')}
              source={geometry}
              candidate={candidate}
              hovered={hoveredSurface === index}
              onHover={(hovered) => { setHoveredSurface(hovered ? index : null); invalidate(); }}
              onSelect={() => onSurfaceSelected?.(surfaceDownRotation(candidate.normal, rotation))}
            />
          ))}
        </group>
      )}
    </>
  );
};

type RangePlanesProps = { minZ: number; maxZ: number };
const RangePlanes: React.FC<RangePlanesProps & { buildVolume: BuildVolume }> = ({ minZ, maxZ, buildVolume }) => (
  <>
    <mesh position={[buildVolume.x / 2, buildVolume.y / 2, minZ]}>
      <planeGeometry args={[buildVolume.x, buildVolume.y]} />
      <meshStandardMaterial color="#ff69b4" transparent opacity={0.13} side={DoubleSide} depthWrite={false} />
    </mesh>
    <mesh position={[buildVolume.x / 2, buildVolume.y / 2, maxZ]}>
      <planeGeometry args={[buildVolume.x, buildVolume.y]} />
      <meshStandardMaterial color="#ff69b4" transparent opacity={0.13} side={DoubleSide} depthWrite={false} />
    </mesh>
  </>
);

const SceneAxes: React.FC<{ buildVolume: BuildVolume }> = ({ buildVolume }) => (
  <group>
    <Line points={[[0, 0, 0.1], [buildVolume.x, 0, 0.1]]} color="#ff5d68" lineWidth={1} />
    <Line points={[[0, 0, 0.1], [0, buildVolume.y, 0.1]]} color="#54d98c" lineWidth={1} />
    <Line points={[[0, 0, 0], [0, 0, buildVolume.z]]} color="#5b8cff" lineWidth={1} />
  </group>
);

const BuildPlate: React.FC<{ buildVolume: BuildVolume }> = ({ buildVolume }) => {
  const gridGeo = useMemo(() => {
    const pts: number[] = [];
    const z = 0.15; // small lift to prevent z-fighting with the floor mesh
    for (let y = 0; y <= buildVolume.y; y += 10) pts.push(0, y, z, buildVolume.x, y, z);
    for (let x = 0; x <= buildVolume.x; x += 10) pts.push(x, 0, z, x, buildVolume.y, z);
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(new Float32Array(pts), 3));
    return geo;
  }, [buildVolume.x, buildVolume.y]);

  return (
    <>
      <mesh position={[buildVolume.x / 2, buildVolume.y / 2, 0]} receiveShadow>
        <planeGeometry args={[buildVolume.x, buildVolume.y]} />
        <meshStandardMaterial color="#111922" metalness={0.1} roughness={0.8} />
      </mesh>
      <lineSegments geometry={gridGeo}>
        <lineBasicMaterial color="#2a3949" transparent opacity={0.75} />
      </lineSegments>
    </>
  );
};

const SeamPickHandler: React.FC<{
  active: boolean;
  onPick: (x: number, y: number) => void;
  onCancel: () => void;
}> = ({ active, onPick, onCancel }) => {
  const { gl, camera } = useThree();
  useEffect(() => {
    if (!active) return;
    const el = gl.domElement;
    el.style.cursor = 'crosshair';
    const handleClick = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      const ray = new Raycaster();
      ray.setFromCamera(new Vector2(nx, ny), camera);
      const target = new Vector3();
      if (ray.ray.intersectPlane(GROUND_PLANE, target)) onPick(target.x, target.y);
    };
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    el.addEventListener('click', handleClick);
    window.addEventListener('keydown', handleKey);
    return () => {
      el.style.cursor = '';
      el.removeEventListener('click', handleClick);
      window.removeEventListener('keydown', handleKey);
    };
  }, [active, gl, camera, onPick, onCancel]);
  return null;
};

const StartPositionMarkers: React.FC<{ positions: Record<string, StartPosition> }> = ({ positions }) => (
  <>
    {Object.entries(positions).map(([fileId, pos]) => (
      <mesh key={fileId} position={[pos.x, pos.y, 2]}>
        <sphereGeometry args={[2.5, 10, 10]} />
        <meshBasicMaterial color="#eeee45" transparent opacity={0.9} depthTest={false} />
      </mesh>
    ))}
  </>
);

const MeasurementOverlay: React.FC<{ points: MeasurementPoint[]; snapHover: MeasurementPoint | null }> = ({ points, snapHover }) => (
  <>
    {points.map((point, index) => (
      <mesh key={`${index}-${point.x}-${point.y}-${point.z}`} position={[point.x, point.y, point.z]} renderOrder={20} raycast={() => null}>
        <sphereGeometry args={[1.6, 16, 16]} />
        <meshBasicMaterial color="#fbbf24" depthTest={false} />
      </mesh>
    ))}
    {points.length === 2 && (
      <Line
        points={points.map((point) => [point.x, point.y, point.z] as [number, number, number])}
        color="#fbbf24"
        lineWidth={2}
        depthTest={false}
        renderOrder={19}
        raycast={() => null}
      />
    )}
    {snapHover && (
      <mesh position={[snapHover.x, snapHover.y, snapHover.z]} renderOrder={21} raycast={() => null}>
        <sphereGeometry args={[2.3, 16, 16]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.9} depthTest={false} wireframe />
      </mesh>
    )}
  </>
);

type ModelViewportProps = {
  stlFiles: SlicerModel[];
  buildVolume?: BuildVolume;
  selectedFileId?: string;
  selectedFileIds?: string[];
  fileRotations?: Record<string, FileRotation>;
  filePositions?: Record<string, FilePosition>;
  fileScales?: Record<string, Scale>;
  activeRange?: { min_z: number; max_z: number } | null;
  onSelectFile?: (fileId: string, additive: boolean) => void;
  onSelectScene?: () => void;
  onDragStart?: (fileId: string) => void;
  onPositionChange?: (fileId: string, x: number, y: number) => void;
  startPositions?: Record<string, StartPosition>;
  startPositionPickTarget?: string | null;
  onStartPositionPick?: (x: number, y: number) => void;
  onStartPositionPickCancel?: () => void;
  measurementActive?: boolean;
  measurementPoints?: MeasurementPoint[];
  onMeasurementPoint?: (point: MeasurementPoint) => void;
  xray?: boolean;
  onGeometryBounds?: (fileId: string, bounds: ModelBounds) => void;
  surfaceSelectionTarget?: string | null;
  onSurfaceSelected?: (fileId: string, rotation: Rotation) => void;
};

export type ModelViewportHandle = {
  setCameraPreset: (preset: 'top' | 'front' | 'right' | 'center') => void;
};

const CameraBridge: React.FC<{ cameraRef: React.MutableRefObject<any> }> = ({ cameraRef }) => {
  const { camera } = useThree();
  useEffect(() => {
    cameraRef.current = camera;
  }, [camera]);
  return null;
};

const ModelViewport = forwardRef<ModelViewportHandle, ModelViewportProps>(({ 
  stlFiles, buildVolume = DEFAULT_BUILD_VOLUME, selectedFileId, selectedFileIds = [], fileRotations, filePositions, fileScales, activeRange, onSelectFile, onSelectScene, onDragStart, onPositionChange,
  startPositions = {}, startPositionPickTarget, onStartPositionPick, onStartPositionPickCancel,
  measurementActive = false, measurementPoints = [], onMeasurementPoint, xray = false, onGeometryBounds,
  surfaceSelectionTarget, onSurfaceSelected,
}, ref) => {
  const cameraRef = useRef<any>(null);
  const orbitControlsRef = useRef<OrbitControlsImpl | null>(null);
  const [snapHover, setSnapHover] = useState<MeasurementPoint | null>(null);

  useEffect(() => {
    if (!measurementActive) setSnapHover(null);
  }, [measurementActive]);

  useEffect(() => {
    setSnapHover(null);
  }, [stlFiles, filePositions, fileRotations]);

  // Living refs so callbacks don't capture stale closures
  const stlFilesRef = useRef(stlFiles);
  stlFilesRef.current = stlFiles;
  const fileRotationsRef = useRef(fileRotations);
  fileRotationsRef.current = fileRotations;
  const filePositionsRef = useRef(filePositions);
  filePositionsRef.current = filePositions;
  const fileScalesRef = useRef(fileScales);
  fileScalesRef.current = fileScales;
  const buildVolumeRef = useRef(buildVolume);
  buildVolumeRef.current = buildVolume;
  const startPositionPickTargetRef = useRef(startPositionPickTarget);
  startPositionPickTargetRef.current = startPositionPickTarget;

  // Camera fit on initial geometry load
  const loadedGeometries = useRef<Map<string, BufferGeometry>>(new Map());
  const hasFitCamera = useRef(false);

  const fitCameraToModels = useCallback(() => {
    const camera = cameraRef.current;
    const controls = orbitControlsRef.current;
    if (!camera || !controls) return;

    const combined = new Box3();
    for (const file of stlFilesRef.current) {
      const geo = loadedGeometries.current.get(file.fileId);
      if (!geo?.boundingBox) continue;
      const rot = fileRotationsRef.current?.[file.fileId] ?? { x: 0, y: 0, z: 0 };
      const pos = filePositionsRef.current?.[file.fileId] ?? { x: buildVolumeRef.current.x / 2, y: buildVolumeRef.current.y / 2 };
      const scale = fileScalesRef.current?.[file.fileId] ?? { x: 1, y: 1, z: 1 };
      const rotMatrix = new Matrix4().makeRotationFromEuler(new Euler(rot.x * DEG2RAD, rot.y * DEG2RAD, rot.z * DEG2RAD)).scale(new Vector3(scale.x, scale.y, scale.z));
      const rotatedBox = geo.boundingBox.clone().applyMatrix4(rotMatrix);
      const zLift = -rotatedBox.min.z;
      combined.union(rotatedBox.clone().translate(new Vector3(pos.x, pos.y, zLift)));
    }

    if (combined.isEmpty()) return;

    const center = new Vector3();
    combined.getCenter(center);
    const size = new Vector3();
    combined.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = camera.fov * (Math.PI / 180);
    const distance = (maxDim / 2) / Math.tan(fov / 2) * 3.5;

    camera.up.set(0, 0, 1);
    camera.position.set(center.x, center.y - distance * 0.65, center.z + distance * 0.55);
    camera.lookAt(center);
    controls.target.copy(center);
    controls.update();
  }, []);

  const handleGeometryLoaded = useCallback((fileId: string, geometry: BufferGeometry) => {
    loadedGeometries.current.set(fileId, geometry);
    const size = new Vector3();
    geometry.boundingBox?.getSize(size);
    onGeometryBounds?.(fileId, { x: size.x, y: size.y, z: size.z });
    if (hasFitCamera.current) return;
    if (stlFilesRef.current.length === 0) return;
    if (loadedGeometries.current.size < stlFilesRef.current.length) return;
    hasFitCamera.current = true;
    fitCameraToModels();
  }, [fitCameraToModels, onGeometryBounds]);
  const setOrbitEnabled = useCallback((enabled: boolean) => {
    if (!orbitControlsRef.current) return;
    orbitControlsRef.current.enabled = enabled;
    if (enabled) {
      // OrbitControls received the native pointerdown before we disabled it and
      // may still be in a ROTATE/PAN state. saveState+reset preserves the current
      // camera position/target while resetting the internal drag-state to NONE,
      // preventing a jump on the next user-initiated rotation.
      orbitControlsRef.current.saveState();
      orbitControlsRef.current.reset();
    }
  }, []);

  const setCameraPreset = useCallback((preset: 'top' | 'front' | 'right' | 'center') => {
    const camera = cameraRef.current;
    const controls = orbitControlsRef.current;
    if (!camera || !controls) return;

    const target = new Vector3(buildVolume.x / 2, buildVolume.y / 2, 0);
    let position = new Vector3(buildVolume.x / 2, -Math.max(220, buildVolume.y + 10), Math.max(180, buildVolume.z * 1.8));
    let up = new Vector3(0, 0, 1);

    if (preset === 'top') {
      position = new Vector3(buildVolume.x / 2, buildVolume.y / 2, Math.max(340, buildVolume.z + 90));
      up = new Vector3(0, 1, 0);
    } else if (preset === 'front') {
      position = new Vector3(buildVolume.x / 2, -Math.max(260, buildVolume.y + 50), Math.max(35, buildVolume.z * 0.35));
    } else if (preset === 'right') {
      position = new Vector3(buildVolume.x + Math.max(220, buildVolume.x * 0.6), buildVolume.y / 2, Math.max(35, buildVolume.z * 0.35));
    }

    camera.up.copy(up);
    camera.position.copy(position);
    camera.lookAt(target);
    controls.target.copy(target);
    controls.update();
  }, [buildVolume]);

  useImperativeHandle(ref, () => ({
    setCameraPreset,
  }), [setCameraPreset]);

  return (
    <Canvas
      camera={{ position: [buildVolume.x / 2, -Math.max(220, buildVolume.y + 10), Math.max(180, buildVolume.z * 1.8)], fov: 45, up: [0, 0, 1], near: 0.1, far: 100000 }}
      style={{ height: '100%', width: '100%', cursor: measurementActive || surfaceSelectionTarget ? 'crosshair' : undefined }}
      frameloop="demand"
      dpr={1}
      shadows="soft"
      onPointerMissed={() => { if (!startPositionPickTargetRef.current && !measurementActive && !surfaceSelectionTarget) onSelectScene?.(); }}
    >
      <CameraBridge cameraRef={cameraRef} />
      <ZUpCamera buildVolume={buildVolume} />
      <color attach="background" args={['#090d12']} />
      <ambientLight intensity={0.72} />
      <SceneLight buildVolume={buildVolume} />
      <OrbitControls ref={orbitControlsRef} enablePan enableZoom enableDamping zoomSpeed={0.35} target={[buildVolume.x / 2, buildVolume.y / 2, 0]} />
      <BuildPlate buildVolume={buildVolume} />
      <SceneAxes buildVolume={buildVolume} />
      {stlFiles.map((file, index) => {
        const defaultX = buildVolume.x / 2 + index * 60 - ((stlFiles.length - 1) * 60) / 2;
        const pos = filePositions?.[file.fileId] ?? { x: defaultX, y: buildVolume.y / 2 };
        return (
          <SlicerStlMesh
            key={file.fileId}
            file={file}
            selected={selectedFileIds.includes(file.fileId) || file.fileId === selectedFileId}
            position={pos}
            rotation={fileRotations?.[file.fileId] ?? { x: 0, y: 0, z: 0 }}
            scale={fileScales?.[file.fileId] ?? { x: 1, y: 1, z: 1 }}
            buildVolume={buildVolume}
            onSelect={(additive) => onSelectFile?.(file.fileId, additive)}
            onDragStart={() => onDragStart?.(file.fileId)}
            onPositionChange={(x, y) => onPositionChange?.(file.fileId, x, y)}
            setOrbitEnabled={setOrbitEnabled}
            onGeometryLoaded={handleGeometryLoaded}
            seamPickActive={!!startPositionPickTarget}
            measurementActive={measurementActive}
            onMeasurementPoint={onMeasurementPoint}
            onSnapHover={setSnapHover}
            surfaceSelectionActive={surfaceSelectionTarget === file.fileId}
            onSurfaceSelected={(rotation) => onSurfaceSelected?.(file.fileId, rotation)}
            xray={xray}
          />
        );
      })}
      {activeRange && <RangePlanes minZ={activeRange.min_z} maxZ={activeRange.max_z} buildVolume={buildVolume} />}
      <SeamPickHandler
        active={!!startPositionPickTarget}
        onPick={onStartPositionPick ?? (() => {})}
        onCancel={onStartPositionPickCancel ?? (() => {})}
      />
      <StartPositionMarkers positions={startPositions} />
      <MeasurementOverlay points={measurementPoints} snapHover={snapHover} />
    </Canvas>
  );
});

ModelViewport.displayName = 'ModelViewport';

export default ModelViewport;
