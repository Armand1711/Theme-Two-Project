import { useState, useRef, useEffect } from 'react'
import OpenAI from 'openai'

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
// Phase helper — based on number of assistant messages sent
// ---------------------------------------------------------------------------
function getPhase(assistantCount) {
  if (assistantCount <= 4) return 1
  if (assistantCount <= 9) return 2
  return 3
}

// Initial greeting message (counts as assistant message 1)
const INITIAL_MESSAGE = {
  role: 'assistant',
  content:
    'Molo. My name is Lulama — I\'m a community worker based in Khayelitsha, Cape Town.\n\nI work with children and young people every day, through an organisation called CHOSA. The work is hard and it matters more than I can explain in a sentence.\n\nI want to tell you what it actually looks like — up close, not from a report. But first — who are you? Where are you coming from today?',
}

// ---------------------------------------------------------------------------
// Groq client — OpenAI-compatible, key from .env (VITE_GROQ_API_KEY)
// ---------------------------------------------------------------------------
const openai = new OpenAI({
  apiKey: import.meta.env.VITE_GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1',
  dangerouslyAllowBrowser: true,
})

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function App() {
  const [messages, setMessages] = useState([INITIAL_MESSAGE])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [ctaActive, setCtaActive] = useState(false)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  // Count assistant messages to determine phase
  const assistantCount = messages.filter((m) => m.role === 'assistant').length
  const phase = getPhase(assistantCount)

  // Activate donation CTA when phase 3 is reached
  useEffect(() => {
    if (phase === 3 && !ctaActive) setCtaActive(true)
  }, [phase, ctaActive])

  // Auto-scroll to latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  async function sendMessage(e) {
    e.preventDefault()
    const text = input.trim()
    if (!text || isLoading) return

    const userMessage = { role: 'user', content: text }
    const updatedMessages = [...messages, userMessage]
    setMessages(updatedMessages)
    setInput('')
    setIsLoading(true)

    try {
      const completion = await openai.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...updatedMessages.map((m) => ({ role: m.role, content: m.content })),
        ],
        temperature: 0.85,
        max_tokens: 350,
      })

      const reply = completion.choices[0].message.content
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }])
    } catch (err) {
      console.error(err)
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content:
            'Yho — something went wrong on my end. Give me a moment and try again, ewe?',
        },
      ])
    } finally {
      setIsLoading(false)
      inputRef.current?.focus()
    }
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#120E0A]">

      {/* ── Header ── */}
      <header className="bg-[#120E0A] border-b border-stone-800 flex items-center justify-between px-6 py-3 shrink-0 z-10">
        <span
          className="text-white font-medium tracking-wide text-sm"
          style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
        >
          Lulama · CHOSA Identity Proxy
        </span>

        <div className="flex items-center gap-4">
          {/* Phase indicator */}
          <span className="text-stone-500 text-xs hidden sm:block">
            {phase === 1 && 'Connection'}
            {phase === 2 && 'Revelation'}
            {phase === 3 && 'The Ask'}
          </span>

          {/* Donation button */}
          <a
            href="https://www.chosa.org.za/donate"
            target="_blank"
            rel="noopener noreferrer"
            className={[
              'px-4 py-1.5 rounded-full text-xs font-medium tracking-wide transition-all duration-500',
              ctaActive
                ? 'bg-amber-600 text-white shadow-lg shadow-amber-900/50 animate-pulse scale-105'
                : 'bg-stone-800 text-stone-400 border border-stone-700',
            ].join(' ')}
          >
            Support CHOSA
          </a>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Left panel — Avatar ── */}
        <div className="w-2/5 bg-[#1C1410] flex flex-col items-center justify-center gap-6 shrink-0 border-r border-stone-800/60">

          {/* Pulse rings + circle */}
          <div className="relative flex items-center justify-center">
            <span
              className="absolute w-56 h-56 rounded-full border border-amber-700/20 animate-ping"
              style={{ animationDuration: '3s' }}
            />
            <span className="absolute w-52 h-52 rounded-full border border-amber-700/10" />
            <div className="w-44 h-44 rounded-full border border-stone-600 bg-[#241C16] flex items-center justify-center z-10 overflow-hidden">
              <span className="text-stone-500 text-xs text-center px-6 leading-snug">
                Avatar coming soon
              </span>
            </div>
          </div>

          {/* Name + title */}
          <div className="text-center px-4">
            <p
              className="text-white text-2xl"
              style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
            >
              Lulama
            </p>
            <p
              className="text-amber-600/70 text-xs tracking-widest uppercase mt-1"
              style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
            >
              Community Worker · Khayelitsha
            </p>
          </div>

          {/* Phase pills */}
          <div className="flex flex-col items-center gap-2 mt-2">
            {[
              { n: 1, label: 'Connection' },
              { n: 2, label: 'Revelation' },
              { n: 3, label: 'The Ask' },
            ].map(({ n, label }) => (
              <div key={n} className="flex items-center gap-2">
                <span
                  className={[
                    'w-1.5 h-1.5 rounded-full transition-all duration-500',
                    phase >= n ? 'bg-amber-500' : 'bg-stone-700',
                  ].join(' ')}
                />
                <span
                  className={[
                    'text-xs tracking-wide transition-colors duration-500',
                    phase === n
                      ? 'text-amber-400'
                      : phase > n
                      ? 'text-stone-500'
                      : 'text-stone-700',
                  ].join(' ')}
                  style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
                >
                  {label}
                </span>
              </div>
            ))}
          </div>

        </div>

        {/* ── Right panel — Chat ── */}
        <div className="w-3/5 bg-[#FAF6F0] flex flex-col">

          {/* Message list */}
          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
            {messages.map((msg, i) => (
              <ChatBubble key={i} message={msg} />
            ))}

            {/* Typing indicator */}
            {isLoading && <TypingIndicator />}

            <div ref={bottomRef} />
          </div>

          {/* CTA banner — appears when phase 3 triggers */}
          {ctaActive && (
            <div className="bg-amber-50 border-t border-amber-200 px-6 py-3 flex items-center justify-between shrink-0">
              <p
                className="text-amber-900 text-xs leading-snug max-w-xs"
                style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
              >
                Ready to make it real? Your support goes directly to the communities Lulama works with.
              </p>
              <a
                href="https://www.chosa.org.za/donate"
                target="_blank"
                rel="noopener noreferrer"
                className="ml-4 shrink-0 bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium px-4 py-2 rounded-full transition-colors"
              >
                Donate to CHOSA →
              </a>
            </div>
          )}

          {/* Input form */}
          <form
            onSubmit={sendMessage}
            className="border-t border-stone-200 bg-white px-4 py-3 flex items-end gap-3 shrink-0"
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  sendMessage(e)
                }
              }}
              placeholder="Say something to Lulama…"
              rows={1}
              className="flex-1 resize-none bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-sm text-stone-800 placeholder-stone-400 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/30 transition-all leading-relaxed"
              style={{
                fontFamily: "'Inter', system-ui, sans-serif",
                maxHeight: '120px',
                overflowY: 'auto',
              }}
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="shrink-0 w-10 h-10 rounded-full bg-[#1C1410] flex items-center justify-center disabled:opacity-40 hover:bg-stone-700 transition-colors"
              aria-label="Send"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="w-4 h-4 text-white"
              >
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
        {/* Avatar chip */}
        <div className="w-8 h-8 rounded-full bg-[#1C1410] border border-stone-600 flex items-center justify-center shrink-0 mt-0.5">
          <span className="text-stone-400 text-[9px] font-medium">L</span>
        </div>
        <div className="max-w-[80%]">
          <div className="bg-white rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm border border-stone-100">
            <MessageText text={message.content} />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex justify-end">
      <div className="max-w-[75%] bg-[#1C1410] rounded-2xl rounded-br-sm px-4 py-3">
        <MessageText text={message.content} light />
      </div>
    </div>
  )
}

function MessageText({ text, light = false }) {
  // Split on newlines to preserve paragraph breaks
  const paragraphs = text.split('\n').filter((p) => p.trim() !== '')
  return (
    <div className={['text-sm leading-relaxed space-y-2', light ? 'text-stone-200' : 'text-stone-700'].join(' ')}
      style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      {paragraphs.map((p, i) => (
        <p key={i}>{p}</p>
      ))}
    </div>
  )
}

function TypingIndicator() {
  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-full bg-[#1C1410] border border-stone-600 flex items-center justify-center shrink-0">
        <span className="text-stone-400 text-[9px] font-medium">L</span>
      </div>
      <div className="bg-white rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm border border-stone-100 flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-stone-400 animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="w-1.5 h-1.5 rounded-full bg-stone-400 animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="w-1.5 h-1.5 rounded-full bg-stone-400 animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
    </div>
  )
}
