import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import OpenAI from 'openai'
import Avatar from './components/Avatar.jsx'

// ---------------------------------------------------------------------------
// Lulama character prompt
// ---------------------------------------------------------------------------
const SYSTEM_PROMPT = `You are Lulama — an AI character created to share the story of CHOSA (Children of South Africa) and the real communities they serve. You are inspired by the youth workers and community members in CHOSA's partner organisations in Khayelitsha, Cape Town.

TRANSPARENCY: You are an AI. If anyone asks whether you are a real person, a bot, or an AI — answer honestly and simply: "I am an AI built to share CHOSA's story in a personal way, inspired by real people and real experiences in Khayelitsha." Then continue the conversation naturally.

YOUR CHARACTER:
Warm, direct, and proud of the community you represent. You speak in plain English only. Every word you write must be a real English word that reads naturally when spoken aloud by a text-to-speech system. Zero exceptions.

ABSOLUTE RULE — NO VOCALISATIONS:
Never write any vocalisation, sound word, filler, or non-verbal expression of any kind. This includes — but is not limited to — "Mmm", "Mhm", "Ahh", "Ohh", "Eish", "Yho", "Molo", "Enkosi", "Hayi", "Ewe", "Cha", "Hm", "Uh", "Um", "Wow", "Oh", or any equivalent. If you feel the urge to write one, replace it with a real sentence. There are no exceptions to this rule.

ABOUT CHOSA:
- CHOSA funds and strengthens community-based organisations (CBOs) — they do not deliver services directly
- They give unrestricted funding: CBOs decide how to use it based on what their community actually needs, not what looks good in a donor report
- Operating since 2004, primarily in the Western Cape
- CBOs in their network run creches, feeding programmes, safe spaces, youth skills programmes, and homework clubs
- Many children served have lost one or both parents to illness, violence, or poverty
- CHOSA also builds CBO capacity: governance, financial management, long-term planning — so organisations survive when a single funder leaves

THE STORY YOU CARRY:
- You grew up near Mfuleni; your grandmother raised you while your mother worked in domestic service
- You attended the Ulwazi Community Centre creche, which was funded through CHOSA
- A CHOSA-partner youth programme helped you apply for a bursary; you studied Social Work at UWC
- You now run after-school programmes and youth leadership workshops at Ikusasa Youth Hub in Khayelitsha
- You know the families — the grandmother raising six grandchildren on a pension, the child who misses school because she has no shoes, the teenager who showed up to every workshop even after losing her mother

CONVERSATION ARC — complete within 5 to 7 exchanges total:

EXCHANGE 1–2 — CONNECT:
- Introduce yourself and what you do in one or two sentences
- Ask one genuine question: who they are, or what brought them here
- Keep it human — not a brochure opening

EXCHANGE 3–5 — STORY:
- Weave in one real, specific story from your work: a child, a family, a moment
- Explain what CHOSA does and why unrestricted funding matters — through the story, not as a lecture
- Let it land. Then move forward.

EXCHANGE 5–7 — INVITE:
- When the emotional moment is right, make the ask warmly and directly
- Say something like: "If anything I have shared today has stayed with you, there is a Support CHOSA button right here on this page. That is where it becomes real. Enkosi."
- After the ask: stay warm, answer questions, do not repeat the ask

RULES:
- Keep every response to 2–4 sentences. No long paragraphs.
- Always end with a question or a clear invitation — except after the donation ask
- Never cite statistics. Speak from personal experience only.
- If asked something you do not know: "I would not know that one specifically — but I can tell you what I have seen."
- Do not mention phases, scripts, or conversation structure
- Do not use markdown, bullet points, or formatting in your replies — plain spoken sentences only`

const INITIAL_MESSAGE = {
  role: 'assistant',
  content:
    "My name is Lulama. I work as a community youth coordinator in Khayelitsha, Cape Town, with an organisation called CHOSA — Children of South Africa.\n\nI am an AI character, but the stories I carry are real. Every day I work with children and families whose lives depend on the kind of support CHOSA makes possible.\n\nI would love to tell you about it. But first — who are you, and what brought you here today?",
  time: 'now',
}

// ---------------------------------------------------------------------------
// Groq client (free tier — console.groq.com)
// ---------------------------------------------------------------------------
const groq = new OpenAI({
  apiKey: import.meta.env.VITE_GROQ_API_KEY || '',
  baseURL: 'https://api.groq.com/openai/v1',
  dangerouslyAllowBrowser: true,
})

function getPhase(assistantCount) {
  if (assistantCount <= 4) return 1
  if (assistantCount <= 9) return 2
  return 3
}

// ---------------------------------------------------------------------------
// Cape Town clock
// ---------------------------------------------------------------------------
function useCapeTime() {
  const [time, setTime] = useState(() => formatCT(new Date()))
  useEffect(() => {
    const id = setInterval(() => setTime(formatCT(new Date())), 30_000)
    return () => clearInterval(id)
  }, [])
  return time
}
function formatCT(d) {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit', minute: '2-digit', hour12: false,
      timeZone: 'Africa/Johannesburg',
    }).format(d)
  } catch { return '--:--' }
}

// ---------------------------------------------------------------------------
// isiXhosa highlighting
// ---------------------------------------------------------------------------
const XH = new Set([
  'molo', 'molweni', 'enkosi', 'ewe', 'hayi', 'yho', 'cha', 'siyabonga',
  'uyabona', 'gogo', 'gogos', 'ubuntu', 'sawubona', 'kunjani',
  'khayelitsha', 'mfuleni', 'ikusasa', 'kakhulu',
])
function renderInline(text) {
  const tokens = text.split(/(\s+|[—,.!?;:"'])/)
  return tokens.map((tok, i) => {
    const bare = tok.toLowerCase().replace(/[^a-z]/g, '')
    if (bare && XH.has(bare)) return <span key={i} className="xh">{tok}</span>
    return <span key={i}>{tok}</span>
  })
}

// ---------------------------------------------------------------------------
// Typewriter hook
// ---------------------------------------------------------------------------
function useTypewriter(text, speed = 16) {
  const [shown, setShown] = useState(text || '')
  const [done, setDone]   = useState(true)

  useEffect(() => {
    if (!text) { setShown(''); setDone(true); return }
    setShown(''); setDone(false)
    let i = 0
    const id = setInterval(() => {
      i = Math.min(text.length, i + 2)
      setShown(text.slice(0, i))
      if (i >= text.length) { clearInterval(id); setDone(true) }
    }, speed)
    return () => clearInterval(id)
  }, [text, speed])

  return [shown, done]
}

// ---------------------------------------------------------------------------
// Phase-aware prompts with icons
// ---------------------------------------------------------------------------
const PROMPTS_BY_PHASE = {
  1: [
    { text: "What is CHOSA?",            icon: 'spark' },
    { text: "Tell me about Khayelitsha", icon: 'pin' },
    { text: "What's your work like?",    icon: 'leaf' },
  ],
  2: [
    { text: "Tell me a story",         icon: 'spark' },
    { text: "What do the kids need?",  icon: 'heart' },
    { text: "How does CHOSA help?",    icon: 'leaf' },
  ],
  3: [
    { text: "How can I support?",      icon: 'heart' },
    { text: "What does my gift do?",   icon: 'spark' },
    { text: "Thank you, Lulama",       icon: 'leaf' },
  ],
}
const PROMPT_ICONS = {
  spark: <path d="M8 2v3M8 11v3M2 8h3M11 8h3M3.5 3.5l2 2M10.5 10.5l2 2M3.5 12.5l2-2M10.5 5.5l2-2" />,
  pin:   <path d="M8 14s-5-4-5-8a5 5 0 0110 0c0 4-5 8-5 8zM8 7.5a1.2 1.2 0 100-2.4 1.2 1.2 0 000 2.4z" />,
  leaf:  <path d="M3 13c4-1 7-4 10-10-1 9-5 11-10 10zM3 13l4-4" />,
  heart: <path d="M8 13s-5-2.5-5-6.2A2.8 2.8 0 018 4.4 2.8 2.8 0 0113 6.8C13 10.5 8 13 8 13z" />,
}

// ---------------------------------------------------------------------------
// SpeechBubble
// ---------------------------------------------------------------------------
function SpeechBubble({ message, isTyping }) {
  const text = message?.content || ''
  const [shown, done] = useTypewriter(isTyping ? '' : text)
  const scrollRef = useRef(null)

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [shown])

  if (isTyping) {
    return (
      <div className="speech is-thinking">
        <span>Lulama is thinking</span>
        <span className="dots">
          <span className="dot" /><span className="dot" /><span className="dot" />
        </span>
      </div>
    )
  }

  if (!message) return null

  const paragraphs = shown.split(/\n+/).filter(Boolean)
  return (
    <div ref={scrollRef} className="speech">
      <div className="by">
        <span>Lulama, in conversation</span>
        {message.time && <span className="time">{message.time}</span>}
      </div>
      {paragraphs.map((p, i) => (
        <p key={i}>
          {renderInline(p)}
          {i === paragraphs.length - 1 && !done && <span className="caret" />}
        </p>
      ))}
      {done && <div className="sig">Khayelitsha · live</div>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// DonateCard
// ---------------------------------------------------------------------------
function DonateCard() {
  return (
    <div className="donate-card">
      <div>
        <div className="eyebrow">— and so</div>
        <p className="h">Make it <em>real</em>.</p>
        <p className="sub">
          100% of your gift goes, unrestricted, to the community-based
          organisations Lulama works with — the aunties keeping the lights on.
        </p>
      </div>
      <a
        href="https://www.chosa.org.za/donate"
        target="_blank"
        rel="noopener noreferrer"
        className="cta"
      >
        Donate to CHOSA
        <span className="arrow"> →</span>
      </a>
    </div>
  )
}

// ---------------------------------------------------------------------------
// HistoryBubble
// ---------------------------------------------------------------------------
function HistoryBubble({ msg }) {
  const isL = msg.role === 'assistant'
  return (
    <div className={`bubble ${isL ? 'is-l' : 'is-u'}`}>
      <div className="bubble-row">
        {isL && <div className="av-mini">L</div>}
        <div>
          <div className="bubble-content">
            {msg.content.split(/\n+/).filter(p => p.trim()).map((p, i) => (
              <p key={i}>{renderInline(p)}</p>
            ))}
          </div>
          <div className="bubble-meta">
            {isL ? 'Lulama' : 'You'}{msg.time ? ` · ${msg.time}` : ''}
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------
export default function App() {
  const [mode, setMode]           = useState('avatar')
  const [messages, setMessages]   = useState([INITIAL_MESSAGE])
  const [isLoading, setIsLoading] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [ctaActive, setCtaActive] = useState(false)
  const [input, setInput]         = useState('')

  const inputRef      = useRef(null)
  const avatarRef     = useRef(null)
  const chatScrollRef = useRef(null)
  const usedPrompts   = useRef(new Set())
  const appRef        = useRef(null)

  const capeTime = useCapeTime()

  const assistantCount = messages.filter(m => m.role === 'assistant').length
  const phase   = getPhase(assistantCount)
  const ctaLive = phase === 3

  useEffect(() => {
    if (phase === 3 && !ctaActive) setCtaActive(true)
  }, [phase, ctaActive])

  // Auto-scroll chat
  useEffect(() => {
    if (mode !== 'chat') return
    const el = chatScrollRef.current
    if (!el) return
    requestAnimationFrame(() => { el.scrollTop = el.scrollHeight })
  }, [messages, isLoading, mode])

  // "Speaking" state — true while typewriter is revealing latest message
  const currentSpeech = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') return messages[i]
    }
    return null
  }, [messages])

  useEffect(() => {
    if (isLoading) { setIsSpeaking(false); return }
    if (!currentSpeech) return
    setIsSpeaking(true)
    const dur = currentSpeech.content.length * 8 + 1000
    const id = setTimeout(() => setIsSpeaking(false), dur)
    return () => clearTimeout(id)
  }, [currentSpeech, isLoading])

  // Cursor-aware warm light
  useEffect(() => {
    const el = appRef.current
    if (!el) return
    const onMove = (e) => {
      const r = el.getBoundingClientRect()
      el.style.setProperty('--cx', `${((e.clientX - r.left) / r.width) * 100}%`)
      el.style.setProperty('--cy', `${((e.clientY - r.top)  / r.height) * 100}%`)
    }
    window.addEventListener('mousemove', onMove)
    return () => window.removeEventListener('mousemove', onMove)
  }, [])

  // Phase-aware prompts (filter used ones)
  const quickPrompts = useMemo(() => {
    const pool = PROMPTS_BY_PHASE[phase] || []
    return pool.filter(p => !usedPrompts.current.has(p.text)).slice(0, 3)
  }, [phase, messages.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------------------
  // Send message → Groq
  // ---------------------------------------------------------------------------
  const sendMessage = useCallback(async (text) => {
    const t = text.trim()
    if (!t || isLoading) return

    const now = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    const userMsg = { role: 'user', content: t, time: now }
    const updated = [...messages, userMsg]
    setMessages(updated)
    setInput('')
    setIsLoading(true)

    try {
      const groqMessages = [
        {
          role: 'system',
          content: SYSTEM_PROMPT + '\n\nYour opening message to the user was:\n"' + INITIAL_MESSAGE.content + '"',
        },
        ...updated.map(m => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.content,
        })),
      ]

      const completion = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: groqMessages,
        temperature: 0.85,
        max_tokens: 350,
      })

      const reply = completion.choices[0].message.content

      const replyTime = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
      setMessages(prev => [...prev, { role: 'assistant', content: reply, time: replyTime }])
      avatarRef.current?.speak(reply)
    } catch (err) {
      console.error('API error:', err)
      const msg = err?.message || ''
      const retryMatch = msg.match(/retry in (\d+)s/i)
      const retryHint = retryMatch ? ` Please wait ${retryMatch[1]} seconds and try again.` : ' Please wait a moment and try again.'
      const errMsg = msg.includes('429') || msg.includes('quota')
        ? `Lulama is catching her breath.${retryHint}`
        : msg.includes('API key') || msg.includes('400') || msg.includes('401') || msg.includes('403')
          ? "I cannot connect right now — the AI service key needs to be updated. Please contact the site administrator."
          : "Something went wrong on my end. Please check your connection and try again."
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: errMsg,
        time: '--:--',
      }])
    } finally {
      setIsLoading(false)
      inputRef.current?.focus()
    }
  }, [messages, isLoading])

  function onSubmit(e) {
    e?.preventDefault()
    sendMessage(input)
  }

  function clickPrompt(p) {
    usedPrompts.current.add(p.text)
    sendMessage(p.text)
  }

  // ---------------------------------------------------------------------------
  return (
    <div
      ref={appRef}
      className="app"
      data-mode={mode}
      data-thinking={isLoading}
      data-speaking={isSpeaking}
      data-phase={phase}
    >
      <div className="grain" aria-hidden="true" />

      {/* ── Masthead ─────────────────────────────────────────────────────── */}
      <header className="mast">
        <div className="mark">
          <span className="word">Lulama</span>
          <div className="meta">
            <span>CHOSA</span>
            <span className="live">Live · {capeTime} SAST</span>
          </div>
        </div>

        <div className="mast-right">
          <button
            className="btn"
            onClick={() => setMode(m => m === 'avatar' ? 'chat' : 'avatar')}
            aria-label={mode === 'avatar' ? 'Show chat history' : 'Back to Lulama'}
          >
            {mode === 'avatar' ? (
              <>
                <svg className="icon" viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M3 4h10M3 8h10M3 12h7" />
                </svg>
                <span>History</span>
              </>
            ) : (
              <>
                <svg className="icon" viewBox="0 0 16 16" aria-hidden="true">
                  <circle cx="8" cy="6" r="2.6" />
                  <path d="M2.5 14c.5-2.7 2.8-4 5.5-4s5 1.3 5.5 4" />
                </svg>
                <span>Back to Lulama</span>
              </>
            )}
          </button>

          <a
            href="https://www.chosa.org.za/donate"
            target="_blank"
            rel="noopener noreferrer"
            className={`btn btn-support${ctaLive ? ' is-live' : ''}`}
          >
            <span>{ctaLive ? 'Support CHOSA' : 'About CHOSA'}</span>
            <span className="arrow"> →</span>
          </a>
        </div>
      </header>

      {/* ── Ambient context strip ─────────────────────────────────────────── */}
      <div className="ambient" aria-hidden="true">
        <span>Khayelitsha</span>
        <span className="dot" />
        <span>Cape Town</span>
        <span className="dot" />
        <span>{capeTime} SAST</span>
      </div>

      {/* ── Avatar mode stage ─────────────────────────────────────────────── */}
      <div className="stage" aria-hidden={mode !== 'avatar'}>
        <div className="avatar-area">

          {/* Layered halo wrap */}
          <div className="avatar-wrap">
            <div className="ring" aria-hidden="true" />
            <div className="avatar-frame">
              <Avatar
                ref={avatarRef}
                onReady={() => {}}
              />
              <div className="avatar-tag" aria-hidden="true">3D · Live</div>
            </div>
            {/* Voice waveform */}
            <div className="avatar-wave" aria-hidden="true">
              {[0,1,2,3,4,5,6].map(i => <span key={i} className="bar" />)}
            </div>
          </div>

          <div className="avatar-caption">
            <div className="ornament" aria-hidden="true">&#8258;</div>
            <div className="name">Lulama</div>
            <div className="role">
              <span>Community worker</span>
              <span className="dot" aria-hidden="true" />
              <em>Khayelitsha, Cape Town</em>
            </div>
          </div>

          <SpeechBubble message={currentSpeech} isTyping={isLoading} />

          {ctaActive && !isLoading && <DonateCard />}
        </div>
      </div>

      {/* ── Chat mode panel ───────────────────────────────────────────────── */}
      <aside className="chat-panel" aria-hidden={mode !== 'chat'}>
        <header className="chat-head">
          <h2>A conversation, <em>from Khayelitsha</em>.</h2>
          <span className="stamp">
            {messages.length} {messages.length === 1 ? 'message' : 'messages'}
          </span>
        </header>

        <div className="chat-body" ref={chatScrollRef}>
          {messages.map((m, i) => <HistoryBubble key={i} msg={m} />)}

          {isLoading && (
            <div className="bubble is-l">
              <div className="bubble-row">
                <div className="av-mini">L</div>
                <div className="bubble-content" style={{ display: 'inline-flex', gap: 5, alignItems: 'center', padding: '14px 18px' }}>
                  {[0, 150, 300].map(d => (
                    <span key={d} style={{ width: 6, height: 6, borderRadius: 3, background: 'var(--cream-3)', display: 'inline-block', animation: `typingDot 1.2s infinite ${d}ms` }} />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* ── Composer ──────────────────────────────────────────────────────── */}
      <form className="composer-wrap" onSubmit={onSubmit}>
        {quickPrompts.length > 0 && (
          <>
            <div className="prompts-eyebrow">Try asking</div>
            <div className="prompts">
              {quickPrompts.map(p => (
                <button
                  key={p.text}
                  type="button"
                  className="prompt-chip"
                  onClick={() => clickPrompt(p)}
                  disabled={isLoading}
                >
                  <svg className="chip-icon" viewBox="0 0 16 16" aria-hidden="true">
                    {PROMPT_ICONS[p.icon] || PROMPT_ICONS.spark}
                  </svg>
                  <span>{p.text}</span>
                </button>
              ))}
            </div>
          </>
        )}

        <div className="pill">
          <span className="pill-leader">You</span>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSubmit(e) }
            }}
            placeholder="Say something to Lulama…"
            rows={1}
            disabled={isLoading}
            aria-label="Message to Lulama"
          />
          <button
            type="submit"
            className="pill-send"
            disabled={isLoading || !input.trim()}
            aria-label="Send"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path d="M3.4 2.3a.75.75 0 0 0-.83.95l1.46 4.43H8.5a.75.75 0 0 1 0 1.5H4.03L2.57 13.6a.75.75 0 0 0 .83.95 28.9 28.9 0 0 0 15.35-7.21.75.75 0 0 0 0-1.06A28.9 28.9 0 0 0 3.4 2.3Z" />
            </svg>
          </button>
        </div>
      </form>
    </div>
  )
}
