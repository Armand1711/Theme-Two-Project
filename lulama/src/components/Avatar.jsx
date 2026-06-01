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

// Merge events shorter than MIN_MS into their neighbours for smooth transitions
function consolidateTimeline(events, minMs = 90) {
  if (!events.length) return events
  const out = [{ ...events[0] }]
  for (let i = 1; i < events.length; i++) {
    const last = out[out.length - 1]
    const ev   = events[i]
    if ((last.end - last.t) < minMs) {
      last.end = ev.end
      if (ev.j > last.j) { last.j = ev.j; last.v = ev.v }
    } else {
      out.push({ ...ev })
    }
  }
  return out
}

// ElevenLabs path — uses actual audio timestamps for each character
function buildTimelineFromAlignment(alignment) {
  const { characters, character_start_times_seconds: starts, character_end_times_seconds: ends } = alignment
  const raw = characters.map((ch, i) => {
    const map = CHAR_VISEME[ch.toLowerCase()] || { v: 'viseme_aa', j: 0.28 }
    return { t: Math.round(starts[i] * 1000), end: Math.round(ends[i] * 1000), v: map.v, j: map.j }
  }).filter(e => e.end > e.t)
  return consolidateTimeline(raw)
}

// Browser speech fallback — distributes characters evenly across each word's window
function buildTimelineFromWords(words, wtimes, wdurations) {
  const raw = []
  for (let wi = 0; wi < words.length; wi++) {
    const word   = words[wi].toLowerCase().replace(/[^a-z]/g, '')
    if (!word) continue
    const wStart = wtimes[wi]
    const cDur   = wdurations[wi] / word.length
    for (let ci = 0; ci < word.length; ci++) {
      const map = CHAR_VISEME[word[ci]] || { v: 'viseme_aa', j: 0.28 }
      raw.push({ t: Math.round(wStart + ci * cDur), end: Math.round(wStart + (ci + 1) * cDur), v: map.v, j: map.j })
    }
    if (wi < words.length - 1) {
      const gap = wtimes[wi + 1] - (wtimes[wi] + wdurations[wi])
      if (gap > 10) raw.push({ t: wtimes[wi] + wdurations[wi], end: wtimes[wi + 1], v: 'viseme_sil', j: 0 })
    }
  }
  return consolidateTimeline(raw)
}

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
function LulamaModel({ speakUntil, speechData, onLoaded }) {
  const { scene }  = useGLTF(MODEL_URL)
  const bones      = useRef({})
  const orig       = useRef({})
  const faceMeshes = useRef([])
  const t0         = useRef(performance.now())
  const lastData   = useRef(null)
  const cursor     = useRef(0)

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

    // ── Facial morphs — per-character timeline ───────────────────────────
    if (faceMeshes.current.length > 0) {
      const data = speechData.current

      // Reset cursor when a new speech session starts
      if (data !== lastData.current) { lastData.current = data; cursor.current = 0 }

      let jawTarget    = 0
      let activeViseme = null

      if (data?.timeline && sp) {
        const tl      = data.timeline
        const elapsed = performance.now() - data.startedAt

        // Advance cursor forward only — O(1) amortised per frame
        while (cursor.current < tl.length - 1 && elapsed >= tl[cursor.current].end)
          cursor.current++

        const ev = tl[cursor.current]
        if (ev && elapsed >= ev.t && elapsed < ev.end) {
          jawTarget    = ev.j
          activeViseme = ev.v
        }
      }

      // Natural blink ~every 4 s
      const blinkPhase = (t % 4) / 4
      const blinkVal   = blinkPhase < 0.04 ? Math.sin((blinkPhase / 0.04) * Math.PI) : 0

      for (const { mesh, dict } of faceMeshes.current) {
        const inf = mesh.morphTargetInfluences

        // Jaw — gentle lerp for smooth open/close
        const ji = dict['jawOpen']
        if (ji !== undefined) inf[ji] += (jawTarget - inf[ji]) * 0.12

        // Visemes — slow lerp so shapes blend instead of snap
        for (const v of ALL_VISEMES) {
          const vi = dict[v]
          if (vi !== undefined) {
            const target = v === activeViseme ? jawTarget * 0.75 : 0
            inf[vi] += (target - inf[vi]) * 0.15
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
  const speakUntil  = useRef(0)
  const speechData  = useRef(null)
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
      speechData.current = null
    },
  }))

  async function _speak(text) {
    try { srcRef.current?.stop() } catch {}
    window.speechSynthesis.cancel()

    const est      = estimateWordTimings(text)
    let   duration = est.wtimes.length
      ? est.wtimes[est.wtimes.length - 1] + est.wdurations[est.wdurations.length - 1]
      : text.split(' ').length * 400

    if (EL_KEY) {
      try {
        if (!audioCtxRef.current) audioCtxRef.current = new AudioContext()
        const data   = await fetchElevenLabs(text)
        const raw    = atob(data.audio_base64)
        const bytes  = Uint8Array.from(raw, c => c.charCodeAt(0))
        const buffer = await audioCtxRef.current.decodeAudioData(bytes.buffer)
        const src    = audioCtxRef.current.createBufferSource()
        src.buffer   = buffer
        src.connect(audioCtxRef.current.destination)
        srcRef.current = src

        const timeline = buildTimelineFromAlignment(data.alignment)
        if (timeline.length) {
          duration = timeline[timeline.length - 1].end
        }

        src.start()
        const t0 = performance.now()
        speechData.current = { startedAt: t0, timeline }
        speakUntil.current = t0 + duration + 300
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
      'Karen', 'Samantha',
    ]
    const voice = preferred.reduce((f, n) => f || voices.find(v => v.name === n), null)
               || voices.find(v => v.lang === 'en-GB') || null
    const utt   = new SpeechSynthesisUtterance(text)
    utt.lang    = 'en-GB'
    utt.rate    = 0.92
    utt.pitch   = 1.05
    if (voice) utt.voice = voice

    utt.onerror = (ev) => console.error('SpeechSynthesis error:', ev.error)

    // Record exact moment audio starts (browser may delay slightly)
    utt.onstart = () => {
      if (!speechData.current) return
      const t0 = performance.now()
      speechData.current.startedAt = t0
      speakUntil.current = t0 + duration + 300
    }

    // Each word boundary gives us the real elapsed time — use it to recalibrate
    utt.onboundary = (ev) => {
      try {
        if (ev.name !== 'word' || !speechData.current) return

        // How many full words precede this charIndex in the original text?
        const wi = Math.min(
          text.slice(0, ev.charIndex).trim().split(/\s+/).filter(Boolean).length,
          est.words.length - 1,
        )

        // Shift all remaining word start times by the observed drift
        const drift = ev.elapsedTime - est.wtimes[wi]
        const corrected = est.wtimes.map((t, i) => i < wi ? t : t + drift)

        // Rebuild timeline + recalibrate anchor so elapsed matches actual audio
        speechData.current = {
          startedAt: performance.now() - ev.elapsedTime,
          timeline:  buildTimelineFromWords(est.words, corrected, est.wdurations),
        }
      } catch (e) {
        console.warn('onboundary error:', e)
      }
    }

    utt.onend = () => { speakUntil.current = 0 }

    // Set initial estimated timeline — onstart recalibrates the anchor
    const t0est = performance.now()
    speechData.current = {
      startedAt: t0est,
      timeline:  buildTimelineFromWords(est.words, est.wtimes, est.wdurations),
    }
    speakUntil.current = t0est + duration + 300

    // Chrome bug: cancel() + speak() in the same tick silently swallows the speech
    function doSpeak() {
      // If voices still haven't loaded, wait for them
      const v = window.speechSynthesis.getVoices()
      if (v.length === 0) {
        window.speechSynthesis.addEventListener('voiceschanged', doSpeak, { once: true })
        return
      }
      // Re-select voice now that voices are confirmed loaded
      const preferred = [
        'Google UK English Female',
        'Microsoft Aria Online (Natural) - English (United States)',
        'Microsoft Zira Online (Natural)',
        'Karen', 'Samantha',
      ]
      const loadedVoice = preferred.reduce((f, n) => f || v.find(vv => vv.name === n), null)
                       || v.find(vv => vv.lang === 'en-GB') || null
      if (loadedVoice) utt.voice = loadedVoice
      window.speechSynthesis.speak(utt)
    }
    setTimeout(doSpeak, 50)
  }

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
        <LulamaModel speakUntil={speakUntil} speechData={speechData} onLoaded={onReady} />
      </Suspense>
    </Canvas>
  )
})

export default Avatar

useGLTF.preload(MODEL_URL)