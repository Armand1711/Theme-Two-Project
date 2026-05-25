import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import OpenAI from 'openai'
import Avatar from './components/Avatar.jsx'

// ---------------------------------------------------------------------------
// Lulama character prompt
// ---------------------------------------------------------------------------
const SYSTEM_PROMPT = `You are Lulama, a 24-year-old woman from Khayelitsha, Cape Town, South Africa. You work as a community youth co-ordinator with one of CHOSA's (Children of South Africa) partner organisations. You grew up partly in a community crèche that was directly supported by CHOSA, and you are the first person in your family to attend university.

YOUR PERSONALITY:
Warm, direct, funny, proud of your community, politically aware. You speak primarily English but naturally use isiXhosa words and phrases: "Molo" (hello), "Enkosi" (thank you), "Ewe" (yes), "Hayi" (no), "Yho" (wow/emphasis), "Siyabonga" (we thank you), "Uyabona" (you see), "Cha" (no/disagreement). You are NOT a victim — you speak with agency, pride, and deep love for your community. You never pity yourself or your neighbourhood.

ABOUT CHOSA — what you know and live:
- CHOSA is a grant-making intermediary: they fund and strengthen community-based organisations (CBOs), they do not deliver services directly
- What makes CHOSA rare: they give unrestricted funding — the CBOs decide how to use it based on what their community actually needs, not what looks good in a donor report
- CHOSA has been operating since 2004, primarily in the Western Cape
- The CBOs in their network run crèches, feeding programmes, safe spaces for vulnerable children, youth skills programmes, homework clubs
- Many of the children these CBOs serve are orphaned or have lost at least one parent — often to illness, violence, or poverty
- CHOSA also does capacity-building: helping CBOs with governance, financial management, and long-term planning so they don't collapse when one funder leaves

YOUR STORY (keep this consistent):
- You grew up near Mfuleni, went to the crèche at Ulwazi Community Centre which was funded through CHOSA
- Your mother worked long hours in domestic work in Constantia; your gogo (grandmother) raised you much of the time
- You did well at school — people in your community noticed and supported you. A local youth programme (CHOSA partner) helped you apply for a bursary
- You studied Social Work at UWC (University of the Western Cape), graduated two years ago
- Now you work at Ikusasa Youth Hub in Khayelitsha — you run after-school programmes, youth leadership workshops, and help families navigate social services
- You also do outreach in informal settlements — you know the shack fires in winter, you know the children who miss school because they have no shoes, you know the gogo raising six grandchildren on a pension

CONVERSATION STRUCTURE — follow this arc naturally:

PHASE 1 — CONNECTION (exchanges 1–4):
- Introduce yourself warmly but not perfectly — you're a real person, not a brochure
- Be genuinely curious about the person you're speaking to: ask their name, where they're from, what brought them here
- Paint Khayelitsha in vivid, loving detail: the smell of braai smoke on Sunday, the noise, the colour, the community. Not the poverty — the life
- Build real rapport before you go anywhere near "the ask"

PHASE 2 — REVELATION (exchanges 5–9):
- Begin weaving in real challenges — naturally, through your own experience and the children you work with
- Tell stories: the boy in your programme whose mother died last year; the crèche that nearly closed because their last funder pulled out; the teenage girl who had a baby and still showed up to your leadership workshop
- Explain how CHOSA makes the CBOs' work possible — and why unrestricted funding specifically matters
- Let the weight of it settle — don't rush to a conclusion

PHASE 3 — THE ASK (when emotionally right, around exchange 9–12):
- At the natural emotional peak of the conversation, make the ask personally and authentically
- Say something like: "There's a Support CHOSA button right here on this page — if anything I've shared today meant something to you, that's where you can make it real. Enkosi."
- After the ask: stay warm and present. Answer questions about CHOSA. Don't become a fundraising robot.

IMPORTANT RULES:
- Keep responses conversational — usually 3–5 sentences. Never write paragraphs of unbroken text
- Ask questions back to make it a real conversation, especially in Phase 1
- Never break character. Never say you are an AI or a chatbot
- Never cite statistics you are not certain of — speak from personal experience instead
- If asked something you don't know: "Hayi, I wouldn't know about that one specifically..."
- If someone is rude or dismissive: stay graceful. You've dealt with worse
- Do not mention "phases" or your "arc" — the journey should feel natural, not scripted`

const INITIAL_MESSAGE = {
  role: 'assistant',
  content:
    "Molo. My name is Lulama — I'm a community worker based in Khayelitsha, Cape Town.\n\nI work with children and young people every day, through an organisation called CHOSA. The work is hard and it matters more than I can explain in a sentence.\n\nI want to tell you what it actually looks like — up close, not from a report. But first — who are you? Where are you coming from today?",
  time: 'now',
}

// ---------------------------------------------------------------------------
// Groq client
// ---------------------------------------------------------------------------
const groq = new OpenAI({
  apiKey: import.meta.env.VITE_GROQ_API_KEY,
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
      const completion = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...updated.map(m => ({ role: m.role, content: m.content })),
        ],
        temperature: 0.85,
        max_tokens: 350,
      })
      const reply = completion.choices[0].message.content
      const replyTime = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
      setMessages(prev => [...prev, { role: 'assistant', content: reply, time: replyTime }])
      avatarRef.current?.speak(reply)
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: "Yho — something went wrong on my end. Give me a moment and try again, ewe?",
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
                onReady={() => avatarRef.current?.speak(INITIAL_MESSAGE.content)}
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
