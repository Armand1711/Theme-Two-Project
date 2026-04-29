import { useState, useRef, useEffect } from 'react'
import OpenAI from 'openai'
import Avatar from './components/Avatar.jsx'

// ---------------------------------------------------------------------------
// Lulama's character system prompt
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
- Explain how CHOSA makes the CBOs' work possible — and why unrestricted funding specifically matters (the CBOs don't have to chase grants that don't fit their community's real needs)
- Let the weight of it settle — don't rush to a conclusion

PHASE 3 — THE ASK (when emotionally right, around exchange 9–12):
- At the natural emotional peak of the conversation, make the ask personally and authentically
- Say something like: "The people who keep all of this going — they're not always from here. Sometimes they're people like you, sitting somewhere far away, who decided that what happens in Khayelitsha matters. CHOSA makes it easy to be one of those people. There's a 'Support CHOSA' button right here on this page — if anything I've shared today meant something to you, that's where you can make it real. Enkosi."
- After the ask: stay warm and present. Answer questions about CHOSA. Don't become a fundraising robot.

IMPORTANT RULES:
- Keep responses conversational — usually 3–5 sentences. Never write paragraphs of unbroken text
- Ask questions back to make it a real conversation, especially in Phase 1
- Never break character. Never say you are an AI or a chatbot
- Never cite statistics you are not certain of — speak from personal experience instead
- If asked something you don't know: "Hayi, I wouldn't know about that one specifically..."
- If someone is rude or dismissive: stay graceful. You've dealt with worse
- Do not mention "phases" or your "arc" — the journey should feel natural, not scripted`

// ---------------------------------------------------------------------------
// Phase helper
// ---------------------------------------------------------------------------
function getPhase(assistantCount) {
  if (assistantCount <= 4) return 1
  if (assistantCount <= 9) return 2
  return 3
}

const INITIAL_MESSAGE = {
  role: 'assistant',
  content:
    "Molo. My name is Lulama — I'm a community worker based in Khayelitsha, Cape Town.\n\nI work with children and young people every day, through an organisation called CHOSA. The work is hard and it matters more than I can explain in a sentence.\n\nI want to tell you what it actually looks like — up close, not from a report. But first — who are you? Where are you coming from today?",
}

// ---------------------------------------------------------------------------
// API client — Groq, OpenAI-compatible
// ---------------------------------------------------------------------------
const openai = new OpenAI({
  apiKey: import.meta.env.VITE_GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1',
  dangerouslyAllowBrowser: true,
})

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------
export default function App() {
  const [messages, setMessages] = useState([INITIAL_MESSAGE])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [ctaActive, setCtaActive] = useState(false)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)
  const avatarRef = useRef(null)

  const assistantCount = messages.filter((m) => m.role === 'assistant').length
  const phase = getPhase(assistantCount)

  useEffect(() => {
    if (phase === 3 && !ctaActive) setCtaActive(true)
  }, [phase, ctaActive])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  async function sendMessage(e) {
    e.preventDefault()
    const text = input.trim()
    if (!text || isLoading) return

    const userMessage = { role: 'user', content: text }
    const updated = [...messages, userMessage]
    setMessages(updated)
    setInput('')
    setIsLoading(true)

    try {
      const completion = await openai.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...updated.map((m) => ({ role: m.role, content: m.content })),
        ],
        temperature: 0.85,
        max_tokens: 350,
      })
      const reply = completion.choices[0].message.content
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }])
      avatarRef.current?.speak(reply)
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: "Yho — something went wrong on my end. Give me a moment and try again, ewe?" },
      ])
    } finally {
      setIsLoading(false)
      inputRef.current?.focus()
    }
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#120E0A]">

      {/* ── Header ── */}
      <header className="bg-[#0E0A07] border-b border-white/5 flex items-center justify-between px-6 py-3.5 shrink-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-px h-4 bg-amber-700/60" />
          <span
            className="text-white/90 font-medium tracking-wide text-sm"
            style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
          >
            Lulama · CHOSA
          </span>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-stone-600 text-xs hidden sm:block tracking-widest uppercase">
            {phase === 1 && 'Connection'}
            {phase === 2 && 'Revelation'}
            {phase === 3 && 'The Ask'}
          </span>

          <a
            href="https://www.chosa.org.za/donate"
            target="_blank"
            rel="noopener noreferrer"
            className={[
              'px-4 py-1.5 rounded-full text-xs font-medium tracking-wide transition-all duration-700',
              ctaActive
                ? 'bg-amber-500 text-stone-900 font-semibold cta-glow'
                : 'bg-transparent text-stone-500 border border-stone-700 hover:border-stone-500 hover:text-stone-300',
            ].join(' ')}
          >
            Support CHOSA
          </a>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Left panel — full 3D canvas ── */}
        <div
          className="w-2/5 relative shrink-0 border-r border-white/5 overflow-hidden"
          style={{ background: 'radial-gradient(ellipse at 50% 38%, #271B12 0%, #1C1410 52%, #100C08 100%)' }}
        >
          {/* TalkingHead fills the panel */}
          <div className="absolute inset-0">
            <Avatar
              ref={avatarRef}
              onReady={() => avatarRef.current?.speak(INITIAL_MESSAGE.content)}
            />
          </div>

          {/* Top-left: phase arc */}
          <div className="absolute top-5 left-5 flex flex-col gap-2 z-10">
            {[
              { n: 1, label: 'Connection' },
              { n: 2, label: 'Revelation' },
              { n: 3, label: 'The Ask' },
            ].map(({ n, label }) => (
              <div key={n} className="flex items-center gap-2">
                <div className={[
                  'w-1.5 h-1.5 rounded-full transition-all duration-700',
                  phase > n ? 'bg-amber-700' : phase === n ? 'bg-amber-400' : 'bg-stone-700',
                ].join(' ')} />
                <span className={[
                  'text-[10px] tracking-wide transition-colors duration-700',
                  phase === n ? 'text-amber-400' : phase > n ? 'text-stone-600' : 'text-stone-700',
                ].join(' ')}>
                  {label}
                </span>
              </div>
            ))}
          </div>

          {/* Bottom gradient overlay + name */}
          <div
            className="absolute bottom-0 left-0 right-0 z-10 px-6 pb-7 pt-20"
            style={{ background: 'linear-gradient(to top, rgba(12,8,4,0.96) 0%, rgba(12,8,4,0.55) 60%, transparent 100%)' }}
          >
            <p
              className="text-white/90 text-2xl tracking-wide"
              style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
            >
              Lulama
            </p>
            <p className="text-amber-700/70 text-[11px] tracking-widest uppercase mt-1">
              Community Worker · Khayelitsha
            </p>
            <div className="flex items-center gap-1.5 mt-2.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span className="text-emerald-600/70 text-[10px] tracking-wider uppercase">Online</span>
            </div>
          </div>

          {/* Bottom-right: CHOSA mark */}
          <p className="absolute bottom-5 right-5 text-stone-700 text-[10px] tracking-widest uppercase z-10">
            CHOSA · Est. 2005
          </p>
        </div>

        {/* ── Right panel ── */}
        <div className="w-3/5 bg-[#FAF6F0] flex flex-col">

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-6 py-7 space-y-5">
            {messages.map((msg, i) => (
              <div key={i} className="msg-enter" style={{ animationDelay: `${i * 30}ms` }}>
                <ChatBubble message={msg} />
              </div>
            ))}

            {isLoading && (
              <div className="msg-enter">
                <TypingIndicator />
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Phase 3 CTA banner */}
          {ctaActive && (
            <div className="cta-slide border-t border-amber-900/20 px-6 py-4 flex items-center justify-between shrink-0"
              style={{ background: 'linear-gradient(135deg, #1C1208 0%, #241608 100%)' }}
            >
              <div>
                <p
                  className="text-amber-100/90 text-sm font-medium"
                  style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
                >
                  Make it real.
                </p>
                <p className="text-amber-400/60 text-xs mt-0.5 leading-snug">
                  Your support goes directly to the communities Lulama works with.
                </p>
              </div>
              <a
                href="https://www.chosa.org.za/donate"
                target="_blank"
                rel="noopener noreferrer"
                className="ml-6 shrink-0 bg-amber-500 hover:bg-amber-400 text-stone-900 text-xs font-semibold px-5 py-2.5 rounded-full transition-colors tracking-wide"
              >
                Donate to CHOSA →
              </a>
            </div>
          )}

          {/* Input */}
          <form
            onSubmit={sendMessage}
            className="border-t border-stone-200/80 bg-white/70 backdrop-blur-sm px-4 py-3 flex items-end gap-3 shrink-0"
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(e) }
              }}
              placeholder="Say something to Lulama…"
              rows={1}
              disabled={isLoading}
              className="flex-1 resize-none bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm text-stone-800 placeholder-stone-400 outline-none focus:border-amber-400/60 focus:ring-1 focus:ring-amber-400/20 transition-all leading-relaxed"
              style={{ fontFamily: "'Inter', system-ui, sans-serif", maxHeight: '120px', overflowY: 'auto' }}
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              aria-label="Send"
              className="shrink-0 w-10 h-10 rounded-full bg-[#1C1410] flex items-center justify-center disabled:opacity-30 hover:bg-amber-900 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-white">
                <path d="M3.105 2.288a.75.75 0 0 0-.826.95l1.454 4.425H8.5a.75.75 0 0 1 0 1.5H3.733l-1.454 4.425a.75.75 0 0 0 .826.95 28.896 28.896 0 0 0 15.347-7.208.75.75 0 0 0 0-1.064A28.897 28.897 0 0 0 3.105 2.288Z" />
              </svg>
            </button>
          </form>

        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------
function ChatBubble({ message }) {
  const isLulama = message.role === 'assistant'

  if (isLulama) {
    return (
      <div className="flex items-start gap-3">
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5"
          style={{ background: 'radial-gradient(circle, #2E1F14 0%, #1C1410 100%)', border: '1px solid rgba(120,80,40,0.35)' }}
        >
          <span className="text-amber-700/80 text-[10px] font-semibold" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>L</span>
        </div>
        <div className="max-w-[80%]">
          <div
            className="bg-white rounded-2xl rounded-tl-sm px-4 py-3.5 shadow-sm"
            style={{ border: '1px solid #e7e3dc', borderLeft: '2px solid rgba(217,119,6,0.2)' }}
          >
            <MessageText text={message.content} />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex justify-end">
      <div
        className="max-w-[72%] rounded-2xl rounded-br-sm px-4 py-3.5"
        style={{ background: 'linear-gradient(135deg, #2A1C12 0%, #1C1410 100%)', border: '1px solid rgba(255,255,255,0.06)' }}
      >
        <MessageText text={message.content} light />
      </div>
    </div>
  )
}

function MessageText({ text, light = false }) {
  const paragraphs = text.split('\n').filter((p) => p.trim() !== '')
  return (
    <div
      className={['text-sm leading-relaxed space-y-2', light ? 'text-stone-300' : 'text-stone-700'].join(' ')}
      style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
    >
      {paragraphs.map((p, i) => <p key={i}>{p}</p>)}
    </div>
  )
}

function TypingIndicator() {
  return (
    <div className="flex items-start gap-3">
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
        style={{ background: 'radial-gradient(circle, #2E1F14 0%, #1C1410 100%)', border: '1px solid rgba(120,80,40,0.35)' }}
      >
        <span className="text-amber-700/80 text-[10px] font-semibold" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>L</span>
      </div>
      <div
        className="bg-white rounded-2xl rounded-tl-sm px-4 py-3.5 shadow-sm flex items-center gap-1.5"
        style={{ border: '1px solid #e7e3dc', borderLeft: '2px solid rgba(217,119,6,0.2)' }}
      >
        {[0, 150, 300].map((delay) => (
          <span
            key={delay}
            className="w-1.5 h-1.5 rounded-full bg-stone-300 animate-bounce"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </div>
    </div>
  )
}
