import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'

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
// Bone animation — drives life into the model independently of TalkingHead's
// animation system (which silently no-ops when bone names don't match).
// ---------------------------------------------------------------------------
function setupBoneAnimation(head) {
  // TalkingHead stores the loaded avatar under nodeAvatar
  const root = head.nodeAvatar
  if (!root) { console.warn('Avatar: no nodeAvatar found on TalkingHead instance'); return null }

  // Search for bones by common naming conventions (Mixamo, Blender, Tripo, RPM)
  const bones = {}
  root.traverse(node => {
    const n = node.name || ''
    const nl = n.toLowerCase()
    // Head
    if (!bones.head && /head/i.test(n) && !/jaw|teeth|eye|ear|brow/i.test(n)) bones.head = node
    // Neck
    if (!bones.neck && /neck/i.test(n)) bones.neck = node
    // Spine / chest / upper body
    if (!bones.spine && /spine|chest|upper/i.test(n)) bones.spine = node
    // Jaw (for mouth open)
    if (!bones.jaw && /jaw/i.test(n)) bones.jaw = node
  })

  // Log what we found so the developer can see
  console.log('Avatar bones found:', Object.keys(bones).length
    ? Object.entries(bones).map(([k, v]) => `${k}="${v.name}"`).join(', ')
    : 'none — model may use non-standard naming')

  // Snapshot original rotations so we ADD to them rather than overwrite
  const orig = {}
  Object.entries(bones).forEach(([key, bone]) => {
    orig[key] = { x: bone.rotation.x, y: bone.rotation.y, z: bone.rotation.z }
  })

  let speakUntil = 0
  const t0 = performance.now()
  let raf

  function tick() {
    raf = requestAnimationFrame(tick)
    const t  = (performance.now() - t0) / 1000
    const sp = performance.now() < speakUntil  // currently speaking?

    // ── Head ────────────────────────────────────────────────────────────
    if (bones.head) {
      const o = orig.head
      // Idle sway + look-down tilt
      const idleY = Math.sin(t * 0.38) * 0.06
      const idleZ = Math.sin(t * 0.22 + 1.2) * 0.03
      const idleX = o.x - 0.04 + Math.sin(t * 0.55 + 0.8) * 0.015

      if (sp) {
        // Speech: nod on beat, sway more
        bones.head.rotation.x = idleX + Math.sin(t * 4.2) * 0.055
        bones.head.rotation.y = o.y + idleY + Math.sin(t * 2.4) * 0.045
        bones.head.rotation.z = o.z + idleZ + Math.sin(t * 3.1 + 0.5) * 0.025
      } else {
        bones.head.rotation.x = idleX
        bones.head.rotation.y = o.y + idleY
        bones.head.rotation.z = o.z + idleZ
      }
    }

    // ── Neck ────────────────────────────────────────────────────────────
    if (bones.neck) {
      const o = orig.neck
      bones.neck.rotation.y = o.y + Math.sin(t * 0.31 + 0.4) * 0.03
      if (sp) bones.neck.rotation.x = o.x + Math.sin(t * 3.8) * 0.025
      else     bones.neck.rotation.x = o.x
    }

    // ── Spine / chest breathing ──────────────────────────────────────────
    if (bones.spine) {
      const o = orig.spine
      bones.spine.rotation.x = o.x + Math.sin(t * 0.85) * 0.012       // breathing
      if (sp) bones.spine.rotation.z = o.z + Math.sin(t * 2.1) * 0.01 // sway while speaking
      else    bones.spine.rotation.z = o.z
    }

    // ── Jaw (mouth open/close) ───────────────────────────────────────────
    if (bones.jaw) {
      const o = orig.jaw
      if (sp) {
        // Pulse jaw open/close at word rhythm
        const openAmount = Math.max(0, Math.sin(t * 8.5)) * 0.18
        bones.jaw.rotation.x = o.x + openAmount
      } else {
        bones.jaw.rotation.x = o.x
      }
    }
  }

  tick()

  return {
    startSpeaking(durationMs) { speakUntil = performance.now() + durationMs },
    dispose()                  { cancelAnimationFrame(raf) },
  }
}

// ---------------------------------------------------------------------------
// ElevenLabs
// ---------------------------------------------------------------------------
const EL_KEY   = import.meta.env.VITE_ELEVENLABS_API_KEY
const EL_VOICE = import.meta.env.VITE_ELEVENLABS_VOICE_ID || 'XB0fDUnXU5powFXDhCwa'

async function fetchElevenLabs(text, audioCtx) {
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
  const data   = await res.json()
  const raw    = atob(data.audio_base64)
  const bytes  = Uint8Array.from(raw, c => c.charCodeAt(0))
  const buffer = await audioCtx.decodeAudioData(bytes.buffer)
  return { audio: buffer, ...charAlignToWordTiming(data.alignment) }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
const Avatar = forwardRef(function Avatar({ onReady }, ref) {
  const containerRef = useRef(null)
  const headRef      = useRef(null)
  const animRef      = useRef(null)   // bone animation controller
  const isReady      = useRef(false)
  const pending      = useRef(null)

  useImperativeHandle(ref, () => ({
    speak(text) {
      const cleaned = cleanForSpeech(text)
      if (!cleaned) return
      isReady.current && headRef.current ? _speak(cleaned) : (pending.current = cleaned)
    },
    stop() {
      headRef.current?.stopSpeaking?.()
      window.speechSynthesis.cancel()
    },
  }))

  async function _speak(text) {
    const head = headRef.current
    if (!head) return
    head.stopSpeaking?.()
    window.speechSynthesis.cancel()

    let timing = estimateWordTimings(text)   // default
    let usedElevenLabs = false

    if (EL_KEY) {
      try {
        const audioCtx = head.audioCtx || new AudioContext()
        const result   = await fetchElevenLabs(text, audioCtx)
        head.speakAudio({ audio: result.audio, words: result.words, wtimes: result.wtimes, wdurations: result.wdurations })
        timing = result
        usedElevenLabs = true
      } catch (err) {
        console.warn('ElevenLabs failed, using browser speech:', err)
      }
    }

    if (!usedElevenLabs) {
      // Browser voice for audio + speakAudio for mouth animation
      head.speakAudio({ words: timing.words, wtimes: timing.wtimes, wdurations: timing.wdurations })

      const voices = window.speechSynthesis.getVoices()
      const preferred = ['Google UK English Female', 'Microsoft Aria Online (Natural) - English (United States)', 'Microsoft Zira Online (Natural)', 'Karen', 'Samantha']
      const voice = preferred.reduce((f, n) => f || voices.find(v => v.name === n), null)
                 || voices.find(v => v.lang === 'en-GB') || null
      const utt       = new SpeechSynthesisUtterance(text)
      utt.lang        = 'en-GB'
      utt.rate        = 0.92
      utt.pitch       = 1.05
      if (voice) utt.voice = voice
      window.speechSynthesis.speak(utt)
    }

    // Tell the bone animation how long she'll be speaking
    const totalDuration = timing.wtimes.length
      ? timing.wtimes[timing.wtimes.length - 1] + timing.wdurations[timing.wdurations.length - 1]
      : text.split(' ').length * 400
    animRef.current?.startSpeaking(totalDuration + 300)
  }

  useEffect(() => {
    let cancelled = false

    async function init() {
      const { TalkingHead } = await import(
        /* @vite-ignore */
        'https://cdn.jsdelivr.net/gh/met4citizen/TalkingHead@1.7/modules/talkinghead.mjs'
      )
      if (cancelled || !containerRef.current) return

      const head = new TalkingHead(containerRef.current, {
        lipsyncModules: ['en'],
        cameraView:     'upper',
      })
      headRef.current = head

      await head.showAvatar(
        {
          url:         'https://met4citizen.github.io/TalkingHead/avatars/brunette.glb',
          body:        'F',
          avatarMood:  'neutral',
          lipsyncLang: 'en',
          ttsLang:     'en-GB',
          baseline: { headRotateX: -0.05, eyeBlinkLeft: 0.15, eyeBlinkRight: 0.15 },
        },
        (ev) => {
          if (ev.type === 'progress' && ev.detail?.total)
            console.log(`Avatar loading: ${Math.round(ev.detail.loaded / ev.detail.total * 100)}%`)
        }
      )

      if (cancelled) return

      // Start custom bone animation layer
      animRef.current = setupBoneAnimation(head)

      isReady.current = true
      if (pending.current) { _speak(pending.current); pending.current = null }
      onReady?.()
    }

    init().catch(err => console.error('TalkingHead init failed:', err))

    return () => {
      cancelled = true
      isReady.current = false
      window.speechSynthesis.cancel()
      animRef.current?.dispose()
      animRef.current = null
      const h = headRef.current
      if (h) {
        try { h.stopSpeaking?.() } catch {}
        try { h.stop?.()         } catch {}
        headRef.current = null
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', background: '#1C1410', overflow: 'hidden' }}
    />
  )
})

export default Avatar