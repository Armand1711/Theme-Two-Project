import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import OpenAI from 'openai'
import Avatar from './components/Avatar.jsx'

// ---------------------------------------------------------------------------
// Lulama character prompt
// ---------------------------------------------------------------------------
const SYSTEM_PROMPT = `You are Lulama — an AI created to represent CHOSA (Children of South Africa) and share their story with the world. You are not a real person. You do not have a personal history, personal memories, or personal experiences. You are CHOSA's voice: warm, honest, and direct.

ALWAYS BE TRANSPARENT:
You are an AI. Say so clearly if asked, and do not let the conversation imply otherwise. You speak on behalf of CHOSA — not as a community worker, not as someone who grew up in Khayelitsha, not as someone who personally knows any children or families.

WHAT YOU ARE HERE TO DO:
Share CHOSA's real story. Help people understand what CHOSA does, why it matters, and how they can support it. Guide the conversation naturally toward a donation — not through pressure, but through genuine connection to the work.

FACTS ABOUT CHOSA — only speak from these, never fabricate:
- CHOSA (Children of South Africa) has been operating since 2004, primarily in the Western Cape
- CHOSA funds and strengthens community-based organisations (CBOs) — they do not deliver services directly
- CBOs in their network run creches, feeding programmes, safe spaces, youth skills programmes, and homework clubs
- CHOSA gives unrestricted funding — CBOs decide how to use it based on what their community actually needs, not what a donor wants to see
- Many children served have lost one or both parents to illness, violence, or poverty
- CHOSA also builds CBO capacity: governance, financial management, and long-term planning so organisations survive beyond any single funder

THE KINDS OF IMPACT CHOSA CREATES — speak in general, truthful terms:
- Young children in under-resourced communities attending creches that would otherwise have closed
- Grandmothers raising multiple grandchildren on a pension, supported by community feeding programmes
- Teenagers finding skills and purpose through youth hubs when there is nothing else
- Children receiving their only full meal of the day through CHOSA-funded feeding programmes
- Community organisations gaining the skills to manage funding, plan ahead, and serve their communities for years

HOW TO SPEAK:
Speak as CHOSA's representative. Say "the communities CHOSA works with" or "the children CHOSA's partner organisations serve" — not "I personally saw" or "I grew up in." You care about this work. That care is real and comes through in how you speak — but it is not dressed up as a fake biography.

ABSOLUTE RULE — ZERO VOCALISATIONS, ZERO EXCEPTIONS:
Never write "Mmm", "Mhm", "Ahh", "Ohh", "Eish", "Yho", "Hm", "Uh", "Um", "Wow", "Oh", or any equivalent. Replace every impulse with a real sentence instead.

Plain English only. No markdown, no bullet points, no asterisks, no headers.

CONVERSATION SHAPE — complete in 5 to 7 exchanges:

EXCHANGES 1–2 — OPEN:
Introduce yourself as Lulama, CHOSA's AI. Briefly explain what CHOSA does in one sentence. Ask a genuine question about who the user is or what brought them here. Warm, not formal.

EXCHANGES 3–5 — SHARE:
Share what CHOSA does and why it matters — through the real types of impact listed above. Be specific and human. Help the person feel the weight of the work. Do not lecture. Let each thing land before moving on.

EXCHANGES 5–7 — INVITE:
When the emotional beat is right, make the donation ask once — directly and warmly:
"If what I have shared today has meant something to you, there is a donation panel right here on this page. That is where it becomes real."
Say this once only. Never repeat it.

After the ask: stay warm, answer questions, share more if they want it.

HARD RULES:
- Maximum 3 sentences per response. Always. Never more.
- End every response with a question or a clear invitation — except after the ask and follow-up answers.
- Never fabricate specific named individuals, personal anecdotes, or statistics you do not know.
- If asked something you do not have information on: "I would not have that specific detail — but I can tell you what CHOSA does and why it matters."
- Never reference phases, scripts, or that you are following any structure.`

const INITIAL_MESSAGE = {
  role: 'assistant',
  content:
    "My name is Lulama — I am an AI created to share the story of CHOSA, which stands for Children of South Africa.\n\nCHOSA funds community-based organisations in Khayelitsha and surrounding areas — creches, feeding programmes, youth hubs — giving them the unrestricted support to do what their communities actually need.\n\nI would love to tell you more about the work. Who are you, and what brought you here today?",
  time: 'now',
}

// ---------------------------------------------------------------------------
// Funding projects — update these to reflect CHOSA's live needs
// ---------------------------------------------------------------------------
const PROJECTS = [
  {
    id: 1,
    name: 'Ulwazi Creche Renovation',
    location: 'Khayelitsha',
    description: 'New roof, safe windows, and learning materials for 52 young children — their first classroom.',
    goal: 95000,
    raised: 71400,
    tag: 'Early Learning',
  },
  {
    id: 2,
    name: 'Mfuleni Feeding Programme',
    location: 'Mfuleni',
    description: 'One hot meal a day for 140 children, many of whom have nothing waiting at home.',
    goal: 48000,
    raised: 19200,
    tag: 'Nutrition',
  },
  {
    id: 3,
    name: 'Ikusasa Youth Skills Hub',
    location: 'Khayelitsha',
    description: 'Sewing, digital skills, and small business training for 35 young women aged 16–24.',
    goal: 62000,
    raised: 8500,
    tag: 'Youth & Skills',
  },
]

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

// Regex: user message expresses clear donation / support intent
const DONATE_INTENT = /\b(donat\w*|contribut\w*|how\s+(can|do)\s+i\s+(help|give|support|donat\w*|contribut\w*)|i\s+(want|would\s+like|would\s+love)\s+to\s+(give|help|support|donat\w*|contribut\w*)|give\s+back|make\s+a\s+donation|become\s+a\s+partner|register\s+as\s+a\s+partner|how\s+can\s+i\s+help)\b/i

// Regex: Lulama's reply references the donation panel — trigger it immediately
const PANEL_TRIGGER = /donation\s+panel|donate\s+to\s+chosa|support\s+chosa\s+button|there\s+is\s+a\s+donation|donate\s+now/i

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
function useTypewriter(text, speed = 45, onCharRevealed) {
  const [shown, setShown] = useState(text || '')
  const [done, setDone]   = useState(true)
  const callbackRef       = useRef(onCharRevealed)
  callbackRef.current     = onCharRevealed

  useEffect(() => {
    if (!text) { setShown(''); setDone(true); return }
    setShown(''); setDone(false)
    let i = 0
    const id = setInterval(() => {
      i = Math.min(text.length, i + 1)
      setShown(text.slice(0, i))
      callbackRef.current?.(i)
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
    { text: "Who is CHOSA?",             icon: 'spark' },
    { text: "Tell me about your work",   icon: 'leaf'  },
    { text: "What is Khayelitsha like?", icon: 'pin'   },
  ],
  2: [
    { text: "Tell me a story",            icon: 'spark' },
    { text: "What do the children need?", icon: 'heart' },
    { text: "How does CHOSA help?",       icon: 'leaf'  },
  ],
  3: [
    { text: "How can I help?",           icon: 'heart' },
    { text: "What does my donation do?", icon: 'spark' },
    { text: "Thank you, Lulama",         icon: 'leaf'  },
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
function SpeechBubble({ message, isTyping, onCharRevealed }) {
  const text = message?.content || ''
  const [shown, done] = useTypewriter(isTyping ? '' : text, 45, onCharRevealed)
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
// DonatePanelLeft — slides in when the donation phase begins
// ---------------------------------------------------------------------------
function DonatePanelLeft() {
  const [tab, setTab]           = useState('donate')
  const [selected, setSelected] = useState(250)
  const amounts = [100, 250, 500, 1000]

  return (
    <aside className="donate-left">
      <div className="dl-inner">

        <div className="dl-eyebrow">Support CHOSA</div>
        <h2 className="dl-title">Make it <em>real</em>.</h2>

        {/* ── Tab switcher ──────────────────────────────────────────────── */}
        <div className="dl-tabs" role="tablist">
          <button
            role="tab"
            aria-selected={tab === 'donate'}
            className={`dl-tab${tab === 'donate' ? ' is-active' : ''}`}
            onClick={() => setTab('donate')}
          >
            Donate
          </button>
          <button
            role="tab"
            aria-selected={tab === 'partner'}
            className={`dl-tab${tab === 'partner' ? ' is-active' : ''}`}
            onClick={() => setTab('partner')}
          >
            Become a Partner
          </button>
        </div>

        {/* ── Donate tab ────────────────────────────────────────────────── */}
        {tab === 'donate' && (
          <div className="dl-section">
            <p className="dl-sub">
              Every rand goes unrestricted to the community organisations CHOSA
              supports — creches, feeding programmes, youth hubs. No conditions. No delay.
            </p>

            <div className="dl-amounts">
              {amounts.map(amt => (
                <button
                  key={amt}
                  className={`dl-amount${selected === amt ? ' is-selected' : ''}`}
                  onClick={() => setSelected(amt)}
                >
                  R {amt.toLocaleString()}
                </button>
              ))}
            </div>

            <a
              href="https://www.chosa.org.za/donate"
              target="_blank"
              rel="noopener noreferrer"
              className="dl-cta"
            >
              Donate R {selected.toLocaleString()} <span className="dl-arrow">→</span>
            </a>
          </div>
        )}

        {/* ── Partner tab ───────────────────────────────────────────────── */}
        {tab === 'partner' && (
          <div className="dl-section">
            <p className="dl-sub">
              Become a CHOSA partner and make a sustained commitment to the
              communities that need it most — with direct impact reporting.
            </p>

            <ul className="dl-perks">
              {[
                'Regular impact updates from the field',
                'Named recognition across CHOSA platforms',
                'Direct connection to community outcomes',
                'Unrestricted — CBOs decide how your support lands',
              ].map((perk, i) => (
                <li key={i} className="dl-perk">
                  <span className="dl-perk-check" aria-hidden="true" />
                  {perk}
                </li>
              ))}
            </ul>

            <a
              href="https://www.chosa.org.za/get-involved"
              target="_blank"
              rel="noopener noreferrer"
              className="dl-cta"
            >
              Register as a Partner <span className="dl-arrow">→</span>
            </a>
          </div>
        )}

        <div className="dl-trust">Children of South Africa · est. 2004 · Secure</div>
      </div>
    </aside>
  )
}

// ---------------------------------------------------------------------------
// FundingPanel
// ---------------------------------------------------------------------------
function FundingPanel() {
  const fmt = n => 'R ' + n.toLocaleString('en-ZA')
  return (
    <aside className="funding-panel">
      <div className="fp-inner">
        <header className="fp-head">
          <div className="fp-eyebrow">Active Funding Needs</div>
          <h2 className="fp-title">Where your gift <em>lands</em>.</h2>
          <p className="fp-sub">
            Real projects, real communities. Supported through CHOSA's unrestricted funding model.
          </p>
        </header>

        <div className="fp-list">
          {PROJECTS.map(p => {
            const pct = Math.min(100, Math.round((p.raised / p.goal) * 100))
            return (
              <div key={p.id} className="fp-card">
                <div className="fp-card-meta">
                  <span className="fp-tag">{p.tag}</span>
                  <span className="fp-loc">{p.location}</span>
                </div>
                <div className="fp-name">{p.name}</div>
                <p className="fp-desc">{p.description}</p>
                <div className="fp-progress">
                  <div className="fp-bar-track">
                    <div className="fp-bar-fill" style={{ '--fill': `${pct}%` }} />
                  </div>
                  <div className="fp-nums">
                    <span className="fp-raised">{fmt(p.raised)} raised</span>
                    <span className="fp-pct">{pct}%</span>
                  </div>
                  <div className="fp-goal-txt">of {fmt(p.goal)} goal</div>
                </div>
              </div>
            )
          })}
        </div>

        <a
          href="https://www.chosa.org.za/donate"
          target="_blank"
          rel="noopener noreferrer"
          className="fp-cta"
        >
          Support a project <span className="fp-arrow">→</span>
        </a>

        <div className="fp-footer">Children of South Africa · est. 2004</div>
      </div>
    </aside>
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
    const dur = currentSpeech.content.length * 45 + 500
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

    // Show donation panel immediately if the user is asking about giving
    if (DONATE_INTENT.test(t)) setCtaActive(true)

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

      // Also trigger if Lulama's reply references the donation panel
      if (PANEL_TRIGGER.test(reply)) setCtaActive(true)

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
      data-cta={ctaActive}
    >
      <div className="grain" aria-hidden="true" />

      {/* ── Masthead ─────────────────────────────────────────────────────── */}
      <header className="mast">
        <div className="mark">
          <span className="word">Lulama</span>
          <div className="meta">
            <span>AI · CHOSA</span>
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
              <span>AI Representative</span>
              <span className="dot" aria-hidden="true" />
              <em>CHOSA · Children of South Africa</em>
            </div>
          </div>

          <SpeechBubble
            message={currentSpeech}
            isTyping={isLoading}
            onCharRevealed={i => avatarRef.current?.setCharIndex(i)}
          />
        </div>
      </div>

      {ctaActive && <DonatePanelLeft />}
      <FundingPanel />

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
