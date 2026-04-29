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

function charAlignToWordTiming(alignment) {
  const { characters, character_start_times_seconds: starts, character_end_times_seconds: ends } = alignment
  const words = [], wtimes = [], wdurations = []
  let word = '', wordStart = null
  for (let i = 0; i < characters.length; i++) {
    const ch = characters[i]
    if (ch === ' ' || ch === '\n') {
      if (word) {
        words.push(word)
        wtimes.push(Math.round(wordStart * 1000))
        wdurations.push(Math.round((ends[i - 1] - wordStart) * 1000))
        word = ''; wordStart = null
      }
    } else {
      if (!word) wordStart = starts[i]
      word += ch
    }
  }
  if (word) {
    words.push(word)
    wtimes.push(Math.round(wordStart * 1000))
    wdurations.push(Math.round((ends[ends.length - 1] - wordStart) * 1000))
  }
  return { words, wtimes, wdurations }
}

function estimateWordTimings(text) {
  const raw = text.split(/\s+/).filter(Boolean)
  const words = [], wtimes = [], wdurations = []
  let cursor = 0
  raw.forEach(token => {
    const word = token.replace(/[^\w'-]/g, '')
    if (!word) return
    const duration = Math.max(180, word.length * 68)
    words.push(word); wtimes.push(cursor); wdurations.push(duration)
    cursor += duration
    if (/[.!?]$/.test(token)) cursor += 280
    else if (/[,;:]$/.test(token)) cursor += 120
  })
  return { words, wtimes, wdurations }
}

// ---------------------------------------------------------------------------
// ElevenLabs
// ---------------------------------------------------------------------------
const EL_KEY   = import.meta.env.VITE_ELEVENLABS_API_KEY
const EL_VOICE = import.meta.env.VITE_ELEVENLABS_VOICE_ID || 'XB0fDUnXU5powFXDhCwa'

async function fetchElevenLabs(text) {
  const res = await fetch(`/api/tts/v1/text-to-speech/${EL_VOICE}/with-timestamps`, {
    method: 'POST',
    headers: { 'xi-api-key': EL_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      model_id: 'eleven_turbo_v2_5',
      voice_settings: { stability: 0.45, similarity_boost: 0.80, style: 0.25, use_speaker_boost: true },
    }),
  })
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}`)
  return res.json()
}

// ---------------------------------------------------------------------------
// Points the camera at a specific world-space target after mount
function CameraFocus({ target }) {
  const { camera } = useThree()
  useEffect(() => {
    camera.lookAt(...target)
  }, [camera]) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

// ---------------------------------------------------------------------------
// 3D model — loads brunette.glb, finds bones, drives all animations
// ---------------------------------------------------------------------------
// RPM viseme cycling order — approximates natural speech rhythm
const VISEME_CYCLE = ['viseme_aa', 'viseme_O', 'viseme_E', 'viseme_PP', 'viseme_aa', 'viseme_U', 'viseme_I', 'viseme_PP']

function LulamaModel({ speakUntil, speechData, onLoaded }) {
  const { scene }    = useGLTF(MODEL_URL)
  const bones        = useRef({})
  const orig         = useRef({})
  // All meshes that carry RPM morph targets (EyeLeft, EyeRight, Wolf3D_Head, Wolf3D_Teeth …)
  const faceMeshes   = useRef([])
  const t0           = useRef(performance.now())

  useEffect(() => {
    const found   = {}
    const meshes  = []

    scene.traverse(node => {
      // ── Collect every mesh that has the RPM facial morph set ────────────
      if (node.isMesh && node.morphTargetDictionary) {
        const dict = node.morphTargetDictionary
        // RPM meshes all share the same full morph list — jawOpen is the marker
        if ('jawOpen' in dict) {
          meshes.push({ mesh: node, dict })
        }
      }

      // ── Bones ────────────────────────────────────────────────────────────
      const n = node.name || ''
      if (!found.head  && /^Head$/i.test(n))                                        found.head  = node
      if (!found.neck  && /^Neck$/i.test(n))                                        found.neck  = node
      if (!found.spine && /^Spine[12]?$|^Spine2$/i.test(n))                        found.spine = node
    })

    faceMeshes.current = meshes
    bones.current      = found
    const snapshot     = {}
    Object.entries(found).forEach(([k, b]) => {
      snapshot[k] = { x: b.rotation.x, y: b.rotation.y, z: b.rotation.z }
    })
    orig.current = snapshot

    console.log('[Avatar] face meshes:', meshes.map(m => m.mesh.name).join(', '))
    console.log('[Avatar] bones:', Object.entries(found).map(([k, v]) => `${k}="${v.name}"`).join(', '))

    onLoaded?.()
  }, [scene]) // eslint-disable-line react-hooks/exhaustive-deps

  useFrame(() => {
    const b  = bones.current
    const o  = orig.current
    const t  = (performance.now() - t0.current) / 1000
    const sp = performance.now() < speakUntil.current

    // Head nod + idle sway
    if (b.head && o.head) {
      const idleY = Math.sin(t * 0.38) * 0.06
      const idleZ = Math.sin(t * 0.22 + 1.2) * 0.03
      const idleX = o.head.x - 0.04 + Math.sin(t * 0.55 + 0.8) * 0.015
      b.head.rotation.x = sp ? idleX + Math.sin(t * 4.2) * 0.055 : idleX
      b.head.rotation.y = o.head.y + idleY + (sp ? Math.sin(t * 2.4) * 0.045 : 0)
      b.head.rotation.z = o.head.z + idleZ + (sp ? Math.sin(t * 3.1 + 0.5) * 0.025 : 0)
    }

    // Neck
    if (b.neck && o.neck) {
      b.neck.rotation.y = o.neck.y + Math.sin(t * 0.31 + 0.4) * 0.03
      b.neck.rotation.x = o.neck.x + (sp ? Math.sin(t * 3.8) * 0.025 : 0)
    }

    // Spine breathing
    if (b.spine && o.spine) {
      b.spine.rotation.x = o.spine.x + Math.sin(t * 0.85) * 0.012
      b.spine.rotation.z = o.spine.z + (sp ? Math.sin(t * 2.1) * 0.01 : 0)
    }

    // ── Facial morphs — word-timing-driven ──────────────────────────────
    if (faceMeshes.current.length > 0) {
      const data = speechData.current
      let jawTarget    = 0
      let activeViseme = null

      if (data && sp) {
        const elapsed = performance.now() - data.startedAt
        for (let i = 0; i < data.wtimes.length; i++) {
          const wStart = data.wtimes[i]
          const wEnd   = wStart + data.wdurations[i]
          if (elapsed >= wStart && elapsed < wEnd) {
            // Arc: jaw opens at word start, closes by word end
            const progress = (elapsed - wStart) / data.wdurations[i]
            jawTarget    = Math.sin(progress * Math.PI) * 0.68
            // Advance through viseme shapes within the word
            activeViseme = VISEME_CYCLE[Math.floor(progress * 4) % VISEME_CYCLE.length]
            break
          }
        }
      }

      // Natural blink every ~4 s
      const blinkPhase = (t % 4) / 4
      const blinkVal   = blinkPhase < 0.04 ? Math.sin((blinkPhase / 0.04) * Math.PI) : 0

      for (const { mesh, dict } of faceMeshes.current) {
        const inf = mesh.morphTargetInfluences

        // Jaw — smooth lerp toward target
        const ji = dict['jawOpen']
        if (ji !== undefined) inf[ji] += (jawTarget - inf[ji]) * 0.3

        // Visemes — clear all, activate current one
        for (const v of VISEME_CYCLE) {
          const vi = dict[v]
          if (vi !== undefined) {
            const target = v === activeViseme ? jawTarget * 0.65 : 0
            inf[vi] += (target - inf[vi]) * 0.35
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
    <primitive
      object={scene}
      position={[0, -2.55, 0]}
      rotation={[0, 0, 0]}
      scale={1.72}
    />
  )
}

// ---------------------------------------------------------------------------
// Avatar — exported component, exposes speak() / stop()
// ---------------------------------------------------------------------------
const Avatar = forwardRef(function Avatar({ onReady }, ref) {
  const speakUntil  = useRef(0)
  const speechData  = useRef(null)   // { startedAt, wtimes, wdurations }
  const audioCtxRef = useRef(null)
  const srcRef      = useRef(null)

  useImperativeHandle(ref, () => ({
    speak(text) {
      const cleaned = cleanForSpeech(text)
      if (cleaned) _speak(cleaned)
    },
    stop() {
      try { srcRef.current?.stop() } catch {}
      window.speechSynthesis.cancel()
      speakUntil.current = 0
    },
  }))

  async function _speak(text) {
    try { srcRef.current?.stop() } catch {}
    window.speechSynthesis.cancel()

    // Calculate a base duration from word timings
    const est = estimateWordTimings(text)
    let duration = est.wtimes.length
      ? est.wtimes[est.wtimes.length - 1] + est.wdurations[est.wdurations.length - 1]
      : text.split(' ').length * 400

    if (EL_KEY) {
      try {
        if (!audioCtxRef.current) audioCtxRef.current = new AudioContext()
        const data    = await fetchElevenLabs(text)
        const raw     = atob(data.audio_base64)
        const bytes   = Uint8Array.from(raw, c => c.charCodeAt(0))
        const buffer  = await audioCtxRef.current.decodeAudioData(bytes.buffer)
        const src     = audioCtxRef.current.createBufferSource()
        src.buffer    = buffer
        src.connect(audioCtxRef.current.destination)
        srcRef.current = src

        const timing = charAlignToWordTiming(data.alignment)
        if (timing.wtimes.length) {
          duration = timing.wtimes[timing.wtimes.length - 1] + timing.wdurations[timing.wdurations.length - 1]
        }

        src.start()
        const elStart = performance.now()
        speechData.current  = { startedAt: elStart, wtimes: timing.wtimes, wdurations: timing.wdurations }
        speakUntil.current  = elStart + duration + 300
        return
      } catch (err) {
        console.warn('ElevenLabs failed, falling back to browser speech:', err)
      }
    }

    // Browser speech fallback
    const voices    = window.speechSynthesis.getVoices()
    const preferred = [
      'Google UK English Female',
      'Microsoft Aria Online (Natural) - English (United States)',
      'Microsoft Zira Online (Natural)',
      'Karen',
      'Samantha',
    ]
    const voice = preferred.reduce((f, n) => f || voices.find(v => v.name === n), null)
               || voices.find(v => v.lang === 'en-GB') || null
    const utt   = new SpeechSynthesisUtterance(text)
    utt.lang    = 'en-GB'
    utt.rate    = 0.92
    utt.pitch   = 1.05
    if (voice) utt.voice = voice
    const brStart = performance.now()
    speechData.current = { startedAt: brStart, wtimes: est.wtimes, wdurations: est.wdurations }
    speakUntil.current = brStart + duration + 300
    window.speechSynthesis.speak(utt)
  }

  return (
    <Canvas
      camera={{ position: [0, 0.42, 1.2], fov: 34 }}
      gl={{ antialias: true, alpha: true }}
      style={{ width: '100%', height: '100%', background: '#1C1410' }}
    >
      {/* Aim the camera at her face / upper chest */}
      <CameraFocus target={[0, 0.18, 0]} />

      {/* Warm South African afternoon light */}
      <ambientLight intensity={0.22} color="#1a0e06" />
      <directionalLight position={[1.2, 3.5, 2]}  intensity={2.8} color="#c97c20" castShadow />
      <pointLight      position={[-2, 1.5, 1]}     intensity={0.9} color="#78350f" />
      <pointLight      position={[0.5, -1, 2]}     intensity={0.4} color="#fbbf24" />
      <pointLight      position={[0, 2, -2]}        intensity={0.6} color="#451a03" />
      <Environment preset="sunset" background={false} />

      <Suspense fallback={null}>
        <LulamaModel speakUntil={speakUntil} speechData={speechData} onLoaded={onReady} />
      </Suspense>
    </Canvas>
  )
})

export default Avatar

// Kick off model download as soon as the module is imported
useGLTF.preload(MODEL_URL)
