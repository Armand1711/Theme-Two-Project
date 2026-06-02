import { Suspense, forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useGLTF, Environment } from '@react-three/drei'

const MODEL_URL = '/models/brunette.glb'

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------
function cleanForSpeech(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`{1,3}[\s\S]*?`{1,3}/g, '')
    .replace(/#{1,6}\s/g, '')
    .replace(/\n+/g, ' ')
    .trim()
}




// ---------------------------------------------------------------------------
// Viseme / lip-sync helpers
// ---------------------------------------------------------------------------

// Per-character → ARKit viseme + jaw-open amount
const CHAR_VISEME = {
  a: { v: 'viseme_aa', j: 0.70 }, e: { v: 'viseme_E',  j: 0.50 },
  i: { v: 'viseme_I',  j: 0.38 }, o: { v: 'viseme_O',  j: 0.62 },
  u: { v: 'viseme_U',  j: 0.45 },
  p: { v: 'viseme_PP', j: 0.04 }, b: { v: 'viseme_PP', j: 0.04 }, m: { v: 'viseme_PP', j: 0.04 },
  f: { v: 'viseme_FF', j: 0.14 }, v: { v: 'viseme_FF', j: 0.14 },
  s: { v: 'viseme_SS', j: 0.12 }, z: { v: 'viseme_SS', j: 0.12 },
  n: { v: 'viseme_nn', j: 0.12 }, l: { v: 'viseme_nn', j: 0.22 },
  r: { v: 'viseme_RR', j: 0.30 },
  k: { v: 'viseme_kk', j: 0.24 }, g: { v: 'viseme_kk', j: 0.24 }, c: { v: 'viseme_kk', j: 0.20 },
  d: { v: 'viseme_DD', j: 0.18 }, t: { v: 'viseme_DD', j: 0.18 },
  j: { v: 'viseme_CH', j: 0.22 }, x: { v: 'viseme_kk', j: 0.22 },
  w: { v: 'viseme_U',  j: 0.35 }, y: { v: 'viseme_I',  j: 0.28 },
  h: { v: 'viseme_aa', j: 0.32 }, q: { v: 'viseme_kk', j: 0.22 },
}

const ALL_VISEMES = [
  'viseme_sil', 'viseme_PP', 'viseme_FF', 'viseme_TH', 'viseme_DD',
  'viseme_kk',  'viseme_CH', 'viseme_SS', 'viseme_nn', 'viseme_RR',
  'viseme_aa',  'viseme_E',  'viseme_I',  'viseme_O',  'viseme_U',
]


// ---------------------------------------------------------------------------
// Camera helper
// ---------------------------------------------------------------------------
function CameraFocus({ target }) {
  const { camera } = useThree()
  useEffect(() => {
    camera.lookAt(...target)
  }, [camera]) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

// ---------------------------------------------------------------------------
// 3D model — loads brunette.glb, binds bones + morph targets, drives animation
// ---------------------------------------------------------------------------
function LulamaModel({ speakUntil, currentViseme, onLoaded }) {
  const { scene }  = useGLTF(MODEL_URL)
  const bones      = useRef({})
  const orig       = useRef({})
  const faceMeshes = useRef([])
  const t0         = useRef(performance.now())

  useEffect(() => {
    const found  = {}
    const meshes = []

    scene.traverse(node => {
      // ── Morph meshes ────────────────────────────────────────────────────
      if (node.isMesh && node.morphTargetDictionary && 'jawOpen' in node.morphTargetDictionary) {
        meshes.push({ mesh: node, dict: node.morphTargetDictionary })
      }

      // ── Bones ────────────────────────────────────────────────────────────
      const n = node.name || ''
      if (!found.head  && /^Head$/i.test(n))               found.head  = node
      if (!found.neck  && /^Neck$/i.test(n))               found.neck  = node
      if (!found.spine && /^Spine[12]?$|^Spine2$/i.test(n)) found.spine = node

      // ── Appearance tweaks — make her look like Lulama ───────────────────
      if (!node.isMesh || !node.material) return

      if (node.name === 'Wolf3D_Glasses') {
        node.visible = false
        return
      }

      node.material = node.material.clone()

      if (node.name === 'Wolf3D_Head' || node.name === 'Wolf3D_Body') {
        // Warm deep-brown skin tint (multiplied with existing texture)
        node.material.color.setHex(0xb06030)
      }
      if (node.name === 'Wolf3D_Hair') {
        node.material.color.setHex(0x0d0705)  // near-black natural hair
        node.material.roughness = 0.92
      }
      if (node.name === 'Wolf3D_Outfit_Top') {
        node.material.color.setHex(0x1a3020)  // deep earthy green
      }
      if (node.name === 'Wolf3D_Outfit_Bottom') {
        node.material.color.setHex(0x2a1a10)  // deep brown/earth
      }
    })

    faceMeshes.current = meshes
    bones.current      = found
    const snap = {}
    Object.entries(found).forEach(([k, b]) => { snap[k] = { x: b.rotation.x, y: b.rotation.y, z: b.rotation.z } })
    orig.current = snap

    onLoaded?.()
  }, [scene]) // eslint-disable-line react-hooks/exhaustive-deps

  useFrame(() => {
    const b  = bones.current
    const o  = orig.current
    const t  = (performance.now() - t0.current) / 1000
    const sp = performance.now() < speakUntil.current

    // ── Head nod + idle sway ──────────────────────────────────────────────
    if (b.head && o.head) {
      const idleY = Math.sin(t * 0.38) * 0.06
      const idleZ = Math.sin(t * 0.22 + 1.2) * 0.03
      const idleX = o.head.x - 0.04 + Math.sin(t * 0.55 + 0.8) * 0.015
      b.head.rotation.x = sp ? idleX + Math.sin(t * 4.2) * 0.045 : idleX
      b.head.rotation.y = o.head.y + idleY + (sp ? Math.sin(t * 2.4) * 0.035 : 0)
      b.head.rotation.z = o.head.z + idleZ + (sp ? Math.sin(t * 3.1 + 0.5) * 0.018 : 0)
    }

    // ── Neck ─────────────────────────────────────────────────────────────
    if (b.neck && o.neck) {
      b.neck.rotation.y = o.neck.y + Math.sin(t * 0.31 + 0.4) * 0.03
      b.neck.rotation.x = o.neck.x + (sp ? Math.sin(t * 3.8) * 0.02 : 0)
    }

    // ── Spine breathing ──────────────────────────────────────────────────
    if (b.spine && o.spine) {
      b.spine.rotation.x = o.spine.x + Math.sin(t * 0.85) * 0.012
      b.spine.rotation.z = o.spine.z + (sp ? Math.sin(t * 2.1) * 0.008 : 0)
    }

    // ── Facial morphs — event-driven, updated on each character reveal ──
    if (faceMeshes.current.length > 0) {
      const vm           = sp ? currentViseme.current : null
      // Micro-oscillation (two overlapping freqs) makes the jaw feel alive
      const jitterA      = Math.sin(t * 13.7) * 0.015
      const jitterB      = Math.sin(t * 7.2)  * 0.010
      const baseJaw      = sp ? 0.05 + jitterA + jitterB : 0
      const jawTarget    = vm ? Math.max(baseJaw, vm.j + jitterA) : baseJaw
      const activeViseme = vm ? vm.v : null

      // Natural blink ~every 4 s
      const blinkPhase = (t % 4) / 4
      const blinkVal   = blinkPhase < 0.04 ? Math.sin((blinkPhase / 0.04) * Math.PI) : 0

      for (const { mesh, dict } of faceMeshes.current) {
        const inf = mesh.morphTargetInfluences

        // Jaw — opens fast (snappy consonant/vowel attack), closes slowly (natural decay)
        const ji = dict['jawOpen']
        if (ji !== undefined) {
          const factor = jawTarget > inf[ji] ? 0.30 : 0.09
          inf[ji] = Math.max(0, inf[ji] + (jawTarget - inf[ji]) * factor)
        }

        // Visemes — fast attack so mouth shape is visible, slower release to blend
        for (const v of ALL_VISEMES) {
          const vi = dict[v]
          if (vi !== undefined) {
            const vTarget = v === activeViseme ? Math.max(0.12, jawTarget * 0.80) : 0
            const vFactor = vTarget > inf[vi] ? 0.25 : 0.11
            inf[vi] += (vTarget - inf[vi]) * vFactor
          }
        }

        // Blink
        const bli = dict['eyeBlinkLeft']
        const bri = dict['eyeBlinkRight']
        if (bli !== undefined) inf[bli] = blinkVal
        if (bri !== undefined) inf[bri] = blinkVal
      }
    }
  })

  return (
    <primitive object={scene} position={[0, -2.55, 0]} rotation={[0, 0, 0]} scale={1.72} />
  )
}

// ---------------------------------------------------------------------------
// Avatar — exported component, exposes speak() / stop()
// ---------------------------------------------------------------------------
const Avatar = forwardRef(function Avatar({ onReady }, ref) {
  const speakUntil     = useRef(0)
  const charVisemes    = useRef(null)   // pre-computed per-character shapes
  const currentViseme  = useRef(null)   // shape currently shown, set by setCharIndex

  useImperativeHandle(ref, () => ({
    // Called when reply arrives — pre-compute the shape sequence
    speak(text) {
      const cleaned = cleanForSpeech(text)
      if (!cleaned) return
      charVisemes.current   = Array.from(cleaned.toLowerCase()).map(ch => CHAR_VISEME[ch] || null)
      currentViseme.current = null
    },
    // Called by the typewriter on every character reveal
    setCharIndex(i) {
      const cv = charVisemes.current
      if (!cv) return
      let vm = null
      // Walk back up to 5 positions for the nearest pronounceable character
      for (let j = Math.min(i - 1, cv.length - 1); j >= Math.max(0, i - 6); j--) {
        if (cv[j]) { vm = cv[j]; break }
      }
      currentViseme.current = vm
      speakUntil.current    = performance.now() + 350
    },
    stop() {
      speakUntil.current    = 0
      charVisemes.current   = null
      currentViseme.current = null
    },
  }))

  return (
    <Canvas
      camera={{ position: [0, 0.48, 1.15], fov: 36 }}
      gl={{ antialias: true, alpha: false }}
      style={{ width: '100%', height: '100%' }}
    >
      <color attach="background" args={['#0f0805']} />
      <CameraFocus target={[0, 0.24, 0]} />
      <ambientLight intensity={0.6} color="#c8a070" />
      <pointLight position={[-2.5, 1.5, 2]} intensity={2.5} color="#c8a070" />
      <Environment preset="sunset" background={false} />
      <Suspense fallback={null}>
        <LulamaModel speakUntil={speakUntil} currentViseme={currentViseme} onLoaded={onReady} />
      </Suspense>
    </Canvas>
  )
})

export default Avatar

useGLTF.preload(MODEL_URL)