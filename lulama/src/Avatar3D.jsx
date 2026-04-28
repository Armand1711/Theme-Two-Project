import { Suspense, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { useGLTF, Environment, ContactShadows } from '@react-three/drei'

// Drop lulama.glb into /public and this loads automatically
const MODEL_URL = '/lulama.glb'

// ---------------------------------------------------------------------------
// Loaded GLB model with idle + thinking animation
// ---------------------------------------------------------------------------
function AvatarModel({ isThinking }) {
  const { scene } = useGLTF(MODEL_URL)
  const ref = useRef()

  useFrame(({ clock }) => {
    if (!ref.current) return
    const t = clock.elapsedTime
    // Breathing bob
    ref.current.position.y = -1.62 + Math.sin(t * 0.85) * 0.013
    // Idle sway
    ref.current.rotation.y = Math.sin(t * 0.25) * 0.055
    // Thinking head tilt
    ref.current.rotation.z = isThinking
      ? Math.sin(t * 2.8) * 0.018
      : Math.sin(t * 0.4) * 0.006
  })

  return (
    <primitive
      ref={ref}
      object={scene}
      position={[0, -1.62, 0]}
      scale={1.72}
    />
  )
}

// ---------------------------------------------------------------------------
// Geometric silhouette — shown while model loads or if no GLB yet
// ---------------------------------------------------------------------------
function Silhouette({ isThinking }) {
  const groupRef = useRef()
  const headRef = useRef()

  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    if (groupRef.current) {
      groupRef.current.position.y = Math.sin(t * 0.85) * 0.014
      groupRef.current.rotation.y = Math.sin(t * 0.28) * 0.06
    }
    if (headRef.current) {
      headRef.current.rotation.z = isThinking
        ? Math.sin(t * 2.6) * 0.05
        : Math.sin(t * 0.35) * 0.008
    }
  })

  const skin = '#2A1810'
  const deep  = '#1E120C'

  return (
    <group ref={groupRef}>
      {/* Bust/shoulders */}
      <mesh position={[0, -0.58, 0]}>
        <capsuleGeometry args={[0.44, 0.32, 8, 20]} />
        <meshStandardMaterial color={deep} roughness={0.7} />
      </mesh>
      <mesh position={[0, -0.85, 0]}>
        <cylinderGeometry args={[0.4, 0.32, 0.55, 20]} />
        <meshStandardMaterial color={deep} roughness={0.75} />
      </mesh>
      {/* Neck */}
      <mesh position={[0, -0.22, 0]}>
        <cylinderGeometry args={[0.085, 0.1, 0.22, 14]} />
        <meshStandardMaterial color={skin} roughness={0.6} />
      </mesh>
      {/* Head */}
      <group ref={headRef} position={[0, 0.2, 0]}>
        <mesh>
          <sphereGeometry args={[0.29, 32, 32]} />
          <meshStandardMaterial color={skin} roughness={0.55} metalness={0.04} />
        </mesh>
        {/* Amber eyes */}
        {[-0.095, 0.095].map((x) => (
          <mesh key={x} position={[x, 0.03, 0.26]}>
            <sphereGeometry args={[0.028, 16, 16]} />
            <meshStandardMaterial
              color="#d97706"
              emissive="#92400e"
              emissiveIntensity={isThinking ? 1.4 : 0.7}
            />
          </mesh>
        ))}
        {/* Hair mass */}
        <mesh position={[0, 0.18, -0.02]}>
          <sphereGeometry args={[0.31, 24, 24]} />
          <meshStandardMaterial color="#0f0805" roughness={0.9} />
        </mesh>
      </group>
    </group>
  )
}

// ---------------------------------------------------------------------------
// Main exported component — wraps everything in a Canvas
// ---------------------------------------------------------------------------
export function Avatar3D({ isThinking = false, modelReady = false }) {
  return (
    <Canvas
      camera={{ position: [0, 0.08, 2.1], fov: 38 }}
      gl={{ antialias: true, alpha: true }}
      style={{ background: 'transparent' }}
    >
      {/* Lighting — warm amber key, cool rim, soft fill */}
      <ambientLight intensity={0.18} color="#1a0e06" />
      <directionalLight position={[1.2, 3.5, 2]} intensity={2.8} color="#c97c20" castShadow />
      <pointLight position={[-2, 1.5, 1]} intensity={0.9} color="#78350f" />
      <pointLight position={[0.5, -1, 2]} intensity={0.4} color="#fbbf24" />
      {/* Rim light from behind */}
      <pointLight position={[0, 2, -2]} intensity={0.6} color="#451a03" />

      <Environment preset="sunset" background={false} />

      <ContactShadows
        position={[0, -1.1, 0]}
        opacity={0.35}
        scale={2}
        blur={1.8}
        color="#0a0604"
      />

      {/* Show real model if GLB exists, otherwise silhouette */}
      {modelReady ? (
        <Suspense fallback={<Silhouette isThinking={isThinking} />}>
          <AvatarModel isThinking={isThinking} />
        </Suspense>
      ) : (
        <Silhouette isThinking={isThinking} />
      )}
    </Canvas>
  )
}

// Preload the GLB as soon as the component is imported (no-op if file missing)
try { useGLTF.preload(MODEL_URL) } catch { /* file not present yet */ }
