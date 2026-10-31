/**
 * Procedural 3D campus (three.js via @react-three/fiber). No external assets.
 *
 *   admin control building · backend core · entry gate + terminal 01 · exit gate + terminal 02
 *   network links (admin ↔ core ↔ terminals) with travelling data pulses · students moving
 *
 * Intro sequence (seconds): campus 0–1.2 → control centre 1.2 → entry gate 1.8 → exit gate 2.4
 * → terminals 3.0 → network 3.6 → students 4.4. `focus` moves the camera
 * ('overview' | 'admin' | 'sync' | 'entry' | 'exit' | 'command').
 * `status` = { entry, exit, admin } in 'online' | 'offline' | 'unknown' tints terminal lights.
 */
import { useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

const C = {
  ground: '#080d17',
  building: '#141f34',
  glass: '#1d2c4a',
  window: '#3d6dff',
  cyan: '#22d3ee',
  entry: '#10b981',
  exit: '#5b8cff',
  offline: '#56677f',
  wall: '#101828',
};

const smooth = (edge0, edge1, x) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

const POSITIONS = {
  admin: new THREE.Vector3(0, 0, -3.2),
  core: new THREE.Vector3(0, 1.6, 0.4),
  entryGate: new THREE.Vector3(-4.6, 0, 4.2),
  exitGate: new THREE.Vector3(4.6, 0, 4.2),
  // Entry terminal stands just outside the wall (verify before entering);
  // exit terminal just inside (verify before leaving).
  entryTerminal: new THREE.Vector3(-3.72, 0, 4.85),
  exitTerminal: new THREE.Vector3(3.72, 0, 3.55),
};

const CAMERA = {
  // Overview frames the campus to the right of the hero headline.
  overview: { pos: [-2.4, 10.5, 21.5], look: [-2.9, 0.3, 0.6] },
  // Story shots keep the subject in the upper part of the viewport (text sits below).
  admin: { pos: [-2.6, 3.0, 5.2], look: [-0.2, 0.2, -3.2] },
  sync: { pos: [0, 11.5, 11.5], look: [0, -1.4, 0.6] },
  entry: { pos: [-1.4, 2.5, 10.8], look: [-4.3, 0.2, 4.4] },
  exit: { pos: [1.2, 3.4, 9.6], look: [4.3, 0.1, 3.8] },
  command: { pos: [0, 12, 9], look: [0, 0, 0.5] },
};

const statusColor = (status, fallback) => (status === 'offline' ? C.offline : fallback);

/** Shared intro clock: t seconds since mount (fast-forwarded when motion is reduced). */
const useIntroTime = (reduced) => {
  const start = useRef(null);
  return (clock) => {
    if (reduced) return 99;
    if (start.current === null) start.current = clock.elapsedTime;
    return clock.elapsedTime - start.current;
  };
};

function Ground() {
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[60, 60]} />
        <meshStandardMaterial color={C.ground} roughness={0.95} metalness={0.05} />
      </mesh>
      <gridHelper
        args={[40, 40, '#22345a', '#16223a']}
        position={[0, 0.002, 0]}
        onUpdate={(grid) => {
          grid.material.transparent = true;
          grid.material.opacity = 0.35;
        }}
      />
      {/* campus courtyard */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.004, 0.6]} receiveShadow>
        <planeGeometry args={[11, 8.6]} />
        <meshStandardMaterial color="#0c1424" roughness={0.8} />
      </mesh>
    </group>
  );
}

function Wall({ from, to }) {
  const length = Math.hypot(to[0] - from[0], to[2] - from[2]);
  const angle = Math.atan2(to[2] - from[2], to[0] - from[0]);
  return (
    <mesh position={[(from[0] + to[0]) / 2, 0.22, (from[2] + to[2]) / 2]} rotation-y={-angle} castShadow receiveShadow>
      <boxGeometry args={[length, 0.44, 0.16]} />
      <meshStandardMaterial color={C.wall} roughness={0.7} metalness={0.2} />
    </mesh>
  );
}

function Perimeter() {
  // Front wall leaves two openings: entry (left) and exit (right).
  return (
    <group>
      <Wall from={[-6, 0, -5.2]} to={[6, 0, -5.2]} />
      <Wall from={[-6, 0, -5.2]} to={[-6, 0, 4.2]} />
      <Wall from={[6, 0, -5.2]} to={[6, 0, 4.2]} />
      <Wall from={[-6, 0, 4.2]} to={[-5.3, 0, 4.2]} />
      <Wall from={[-3.9, 0, 4.2]} to={[3.9, 0, 4.2]} />
      <Wall from={[5.3, 0, 4.2]} to={[6, 0, 4.2]} />
    </group>
  );
}

function AdminBuilding({ intro }) {
  const group = useRef();
  const panes = useRef();
  const COLS = 9;
  const ROWS = 6;
  const seeds = useMemo(() => Array.from({ length: COLS * ROWS }, (_, i) => ((i * 9301 + 49297) % 233280) / 233280), []);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const color = useMemo(() => new THREE.Color(), []);
  useFrame(({ clock }) => {
    const t = intro(clock);
    const rise = smooth(0.1, 1.2, t);
    if (group.current) group.current.scale.y = Math.max(0.001, rise);
    const glow = smooth(1.2, 1.9, t);
    if (!panes.current) return;
    for (let i = 0; i < COLS * ROWS; i += 1) {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      dummy.position.set(-1.44 + col * 0.36, 0.42 + row * 0.42, 0.905);
      dummy.updateMatrix();
      panes.current.setMatrixAt(i, dummy.matrix);
      const lit = seeds[i] > 0.28 ? 1 : 0.15;
      const flicker = 0.85 + 0.15 * Math.sin(clock.elapsedTime * 0.6 + seeds[i] * 20);
      const k = glow * lit * flicker;
      color.setRGB(0.24 * k + 0.02, 0.43 * k + 0.03, 1.0 * k + 0.06);
      panes.current.setColorAt(i, color);
    }
    panes.current.instanceMatrix.needsUpdate = true;
    if (panes.current.instanceColor) panes.current.instanceColor.needsUpdate = true;
  });
  return (
    <group position={POSITIONS.admin} ref={group}>
      <mesh position={[0, 1.45, 0]} castShadow receiveShadow>
        <boxGeometry args={[3.4, 2.9, 1.8]} />
        <meshStandardMaterial color={C.building} roughness={0.3} metalness={0.75} />
      </mesh>
      {/* vertical fins */}
      {[-1.62, -0.9, -0.18, 0.54, 1.26].map((x) => (
        <mesh key={x} position={[x + 0.18, 1.45, 0.93]} castShadow>
          <boxGeometry args={[0.04, 2.8, 0.06]} />
          <meshStandardMaterial color="#26385c" metalness={0.9} roughness={0.25} />
        </mesh>
      ))}
      <instancedMesh ref={panes} args={[undefined, undefined, COLS * ROWS]}>
        <planeGeometry args={[0.3, 0.3]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <mesh position={[0, 3.2, 0]} castShadow>
        <boxGeometry args={[2.2, 0.6, 1.2]} />
        <meshStandardMaterial color={C.glass} roughness={0.2} metalness={0.8} />
      </mesh>
      <mesh position={[0, 3.22, 0.605]}>
        <planeGeometry args={[1.9, 0.08]} />
        <meshBasicMaterial color={C.cyan} toneMapped={false} />
      </mesh>
      {/* rooftop beacon */}
      <mesh position={[0, 3.62, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 0.3, 12]} />
        <meshStandardMaterial color={C.cyan} emissive={C.cyan} emissiveIntensity={1.5} toneMapped={false} />
      </mesh>
      <pointLight position={[0, 1.6, 2.4]} intensity={4} distance={6} decay={2} color="#4a6dff" />
    </group>
  );
}

/** Light pool + beam marking a gate (status-tinted). */
function GateHalo({ position, color, appearAt, intro }) {
  const disc = useRef();
  const beam = useRef();
  useFrame(({ clock }) => {
    const on = smooth(appearAt, appearAt + 0.8, intro(clock));
    const pulse = 0.75 + 0.25 * Math.sin(clock.elapsedTime * 1.6);
    if (disc.current) disc.current.opacity = on * 0.35 * pulse;
    if (beam.current) beam.current.opacity = on * 0.045;
  });
  return (
    <group position={position}>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.01, 0.6]}>
        <circleGeometry args={[1.5, 48]} />
        <meshBasicMaterial ref={disc} color={color} transparent opacity={0} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh position={[0, 2.5, 0.2]}>
        <cylinderGeometry args={[0.55, 0.95, 5, 32, 1, true]} />
        <meshBasicMaterial ref={beam} color={color} transparent opacity={0} side={THREE.DoubleSide} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

function BackendCore({ intro }) {
  const ringA = useRef();
  const ringB = useRef();
  const core = useRef();
  const group = useRef();
  useFrame(({ clock }) => {
    const t = intro(clock);
    const on = smooth(1.2, 2.0, t);
    if (group.current) group.current.scale.setScalar(Math.max(0.001, on));
    if (ringA.current) ringA.current.rotation.z = clock.elapsedTime * 0.6;
    if (ringB.current) ringB.current.rotation.x = clock.elapsedTime * 0.45;
    if (core.current) {
      core.current.rotation.y = clock.elapsedTime * 0.5;
      core.current.position.y = Math.sin(clock.elapsedTime * 1.2) * 0.06;
    }
  });
  return (
    <group position={POSITIONS.core} ref={group}>
      <mesh ref={core}>
        <octahedronGeometry args={[0.32, 0]} />
        <meshStandardMaterial color="#0e2140" emissive={C.cyan} emissiveIntensity={0.9} metalness={0.6} roughness={0.2} toneMapped={false} />
      </mesh>
      <mesh ref={ringA}>
        <torusGeometry args={[0.6, 0.012, 8, 64]} />
        <meshBasicMaterial color={C.cyan} transparent opacity={0.7} toneMapped={false} />
      </mesh>
      <mesh ref={ringB} rotation-y={Math.PI / 2}>
        <torusGeometry args={[0.75, 0.01, 8, 64]} />
        <meshBasicMaterial color="#5b8cff" transparent opacity={0.5} toneMapped={false} />
      </mesh>
      <pointLight color={C.cyan} intensity={6} distance={6} decay={2} />
    </group>
  );
}

function Gate({ position, accent, appearAt, label, intro }) {
  const group = useRef();
  const arm = useRef();
  const strips = useRef([]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const on = smooth(appearAt, appearAt + 0.6, intro(clock));
    if (group.current) group.current.scale.y = Math.max(0.001, on);
    strips.current.forEach((m) => m && (m.emissiveIntensity = on * 1.6));
    // barrier arm lifts periodically (an authorised passage)
    if (arm.current) {
      const cycle = (t + (label === 'EXIT' ? 2.2 : 0)) % 4.4;
      const lift = cycle > 1.2 && cycle < 2.6 ? smooth(1.2, 1.6, cycle) * (1 - smooth(2.2, 2.6, cycle)) : 0;
      arm.current.rotation.z = (label === 'EXIT' ? -1 : 1) * lift * 1.2;
    }
  });
  return (
    <group position={position} ref={group}>
      {[-0.7, 0.7].map((x) => (
        <mesh key={x} position={[x, 0.9, 0]} castShadow>
          <boxGeometry args={[0.22, 1.8, 0.3]} />
          <meshStandardMaterial color="#1a2742" roughness={0.3} metalness={0.8} />
        </mesh>
      ))}
      <mesh position={[0, 1.86, 0]} castShadow>
        <boxGeometry args={[1.66, 0.14, 0.34]} />
        <meshStandardMaterial color="#1a2742" roughness={0.3} metalness={0.8} />
      </mesh>
      <mesh position={[0, 1.86, 0.172]}>
        <boxGeometry args={[1.4, 0.03, 0.005]} />
        <meshStandardMaterial ref={(m) => (strips.current[0] = m)} color="#000" emissive={accent} emissiveIntensity={0} toneMapped={false} />
      </mesh>
      {[-0.7, 0.7].map((x, i) => (
        <mesh key={`s${x}`} position={[x, 0.9, 0.152]}>
          <boxGeometry args={[0.03, 1.5, 0.005]} />
          <meshStandardMaterial ref={(m) => (strips.current[i + 1] = m)} color="#000" emissive={accent} emissiveIntensity={0} toneMapped={false} />
        </mesh>
      ))}
      {/* barrier arm pivoting at the left post */}
      <group position={[label === 'EXIT' ? 0.6 : -0.6, 0.72, 0.05]}>
        <mesh ref={arm}>
          <boxGeometry args={[0.01, 0.01, 0.01]} />
          <meshBasicMaterial visible={false} />
          <mesh position={[label === 'EXIT' ? -0.6 : 0.6, 0, 0]}>
            <boxGeometry args={[1.2, 0.05, 0.05]} />
            <meshStandardMaterial color="#d6dde8" emissive={accent} emissiveIntensity={0.25} />
          </mesh>
        </mesh>
      </group>
      <pointLight position={[0, 1.6, 0.8]} color={accent} intensity={3} distance={4} decay={2} />
    </group>
  );
}

function Terminal({ position, accent, appearAt, status, intro }) {
  const screen = useRef();
  const sensor = useRef();
  const group = useRef();
  useFrame(({ clock }) => {
    const on = smooth(appearAt, appearAt + 0.5, intro(clock));
    if (group.current) group.current.scale.setScalar(Math.max(0.001, on));
    const pulse = 0.6 + 0.4 * Math.sin(clock.elapsedTime * 2.4);
    if (screen.current) screen.current.emissiveIntensity = on * (status === 'offline' ? 0.15 : 1.1);
    if (sensor.current) sensor.current.emissiveIntensity = on * (status === 'offline' ? 0.05 : pulse * 1.6);
  });
  const color = statusColor(status, accent);
  return (
    <group position={position} ref={group}>
      <mesh position={[0, 0.5, 0]} castShadow>
        <cylinderGeometry args={[0.05, 0.08, 1.0, 16]} />
        <meshStandardMaterial color="#1a2742" metalness={0.8} roughness={0.3} />
      </mesh>
      {/* X990-style slab: screen above, fingerprint sensor below */}
      <group position={[0, 1.15, 0]} rotation-x={-0.25}>
        <mesh castShadow>
          <boxGeometry args={[0.36, 0.56, 0.07]} />
          <meshStandardMaterial color="#0b111d" metalness={0.6} roughness={0.25} />
        </mesh>
        <mesh position={[0, 0.09, 0.037]}>
          <planeGeometry args={[0.28, 0.26]} />
          <meshStandardMaterial ref={screen} color="#06101f" emissive={color} emissiveIntensity={0} toneMapped={false} />
        </mesh>
        <mesh position={[0, -0.17, 0.037]}>
          <circleGeometry args={[0.055, 32]} />
          <meshStandardMaterial ref={sensor} color="#06101f" emissive={color} emissiveIntensity={0} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

/** Curved link between two points with data pulses travelling along it. */
function Link({ from, to, color, appearAt, intro, pulses = 3, speed = 0.35, height = 1.6 }) {
  const curve = useMemo(() => {
    const mid = from.clone().lerp(to, 0.5);
    mid.y += height;
    return new THREE.QuadraticBezierCurve3(from.clone(), mid, to.clone());
  }, [from, to, height]);
  const tube = useMemo(() => new THREE.TubeGeometry(curve, 48, 0.012, 6, false), [curve]);
  const material = useRef();
  const dots = useRef([]);
  useFrame(({ clock }) => {
    const t = intro(clock);
    const on = smooth(appearAt, appearAt + 0.8, t);
    if (material.current) material.current.opacity = on * 0.55;
    dots.current.forEach((dot, i) => {
      if (!dot) return;
      const p = ((clock.elapsedTime * speed + i / pulses) % 1 + 1) % 1;
      dot.position.copy(curve.getPoint(p));
      dot.visible = on > 0.6;
    });
  });
  return (
    <group>
      <mesh geometry={tube}>
        <meshBasicMaterial ref={material} color={color} transparent opacity={0} toneMapped={false} />
      </mesh>
      {Array.from({ length: pulses }, (_, i) => (
        <mesh key={i} ref={(m) => (dots.current[i] = m)}>
          <sphereGeometry args={[0.045, 12, 12]} />
          <meshBasicMaterial color={color} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

/** Students walking in through the entry gate and out through the exit gate. */
function Students({ intro, count = 18 }) {
  const mesh = useRef();
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const colors = useMemo(() => {
    const list = new Float32Array(count * 3);
    const a = new THREE.Color(C.entry);
    const b = new THREE.Color('#8fb0ff');
    for (let i = 0; i < count; i += 1) (i % 2 ? b : a).toArray(list, i * 3);
    return list;
  }, [count]);
  const paths = useMemo(() => {
    const inbound = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-8, 0, 9),
      new THREE.Vector3(-4.6, 0, 6),
      new THREE.Vector3(-4.6, 0, 4.2),
      new THREE.Vector3(-3, 0, 1.6),
      new THREE.Vector3(-0.8, 0, -1.0),
    ]);
    const outbound = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.8, 0, -1.0),
      new THREE.Vector3(3, 0, 1.6),
      new THREE.Vector3(4.6, 0, 4.2),
      new THREE.Vector3(4.6, 0, 6),
      new THREE.Vector3(8, 0, 9),
    ]);
    return [inbound, outbound];
  }, []);
  useFrame(({ clock }) => {
    if (!mesh.current) return;
    const on = smooth(4.4, 5.2, intro(clock));
    for (let i = 0; i < count; i += 1) {
      const path = paths[i % 2];
      const p = (clock.elapsedTime * 0.045 + i / count) % 1;
      const point = path.getPoint(p);
      dummy.position.set(point.x + ((i * 37) % 7) * 0.04 - 0.12, 0.17, point.z);
      dummy.scale.setScalar(on);
      dummy.updateMatrix();
      mesh.current.setMatrixAt(i, dummy.matrix);
    }
    mesh.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, count]} castShadow>
      <capsuleGeometry args={[0.07, 0.2, 4, 8]}>
        <instancedBufferAttribute attach="attributes-color" args={[colors, 3]} />
      </capsuleGeometry>
      <meshStandardMaterial vertexColors roughness={0.35} emissive="#1d3a6b" emissiveIntensity={0.6} />
    </instancedMesh>
  );
}

function CameraRig({ focus, reduced }) {
  const { camera } = useThree();
  const look = useRef(new THREE.Vector3(...CAMERA.overview.look));
  useFrame(({ clock }, delta) => {
    const target = CAMERA[focus] || CAMERA.overview;
    const k = reduced ? 1 : 1 - Math.exp(-delta * 1.6);
    // gentle orbit drift on the overview shot
    const drift = focus === 'overview' && !reduced ? Math.sin(clock.elapsedTime * 0.12) * 0.9 : 0;
    camera.position.lerp(new THREE.Vector3(target.pos[0] + drift, target.pos[1], target.pos[2]), k);
    look.current.lerp(new THREE.Vector3(...target.look), k);
    camera.lookAt(look.current);
  });
  return null;
}

function Scene({ focus, status, reduced }) {
  const intro = useIntroTime(reduced);
  const s = status || {};
  return (
    <>
      <color attach="background" args={['#05080f']} />
      <fog attach="fog" args={['#05080f', 14, 34]} />
      <ambientLight intensity={0.45} color="#9fb4d9" />
      <hemisphereLight args={['#5b7bb5', '#04060b', 0.4]} />
      <directionalLight
        position={[6, 10, 6]}
        intensity={1.15}
        color="#cfdcff"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
      />
      <directionalLight position={[-8, 4, -6]} intensity={0.6} color="#22d3ee" />
      <CameraRig focus={focus} reduced={reduced} />
      <Ground />
      <group>
        <Perimeter />
        <AdminBuilding intro={intro} />
        <BackendCore intro={intro} />
        <GateHalo position={POSITIONS.entryGate} color={statusColor(s.entry, C.entry)} appearAt={1.8} intro={intro} />
        <GateHalo position={POSITIONS.exitGate} color={statusColor(s.exit, C.exit)} appearAt={2.4} intro={intro} />
        <Gate position={POSITIONS.entryGate} accent={statusColor(s.entry, C.entry)} appearAt={1.8} label="ENTRY" intro={intro} />
        <Gate position={POSITIONS.exitGate} accent={statusColor(s.exit, C.exit)} appearAt={2.4} label="EXIT" intro={intro} />
        <Terminal position={POSITIONS.entryTerminal} accent={C.entry} appearAt={3.0} status={s.entry} intro={intro} />
        <Terminal position={POSITIONS.exitTerminal} accent={C.exit} appearAt={3.15} status={s.exit} intro={intro} />
      </group>
      <Link from={new THREE.Vector3(0, 2.6, -2.3)} to={POSITIONS.core} color={C.cyan} appearAt={3.6} intro={intro} height={0.6} pulses={2} />
      <Link
        from={POSITIONS.core}
        to={POSITIONS.entryTerminal.clone().setY(1.25)}
        color={s.entry === 'offline' ? C.offline : C.entry}
        appearAt={3.8}
        intro={intro}
      />
      <Link
        from={POSITIONS.core}
        to={POSITIONS.exitTerminal.clone().setY(1.25)}
        color={s.exit === 'offline' ? C.offline : C.exit}
        appearAt={4.0}
        intro={intro}
        speed={0.3}
      />
      <Students intro={intro} />
    </>
  );
}

export default function CampusScene3D({ focus = 'overview', status, active = true, reduced = false, className = '' }) {
  return (
    <div className={className} aria-hidden="true">
      <Canvas
        shadows
        dpr={[1, 1.75]}
        frameloop={active ? (reduced ? 'demand' : 'always') : 'never'}
        camera={{ position: CAMERA.overview.pos, fov: 38, near: 0.1, far: 80 }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.15;
        }}
      >
        <Scene focus={focus} status={status} reduced={reduced} />
      </Canvas>
    </div>
  );
}
