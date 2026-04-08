export default function App() {
  return (
    <div className="flex flex-col h-screen overflow-hidden">

      {/* Header */}
      <header className="bg-[#120E0A] flex items-center justify-between px-6 py-3 shrink-0">
        <span className="text-white font-medium tracking-wide" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
          Lulama · CHOSA Identity Proxy
        </span>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-green-400 inline-block" />
          <span className="text-green-400 text-sm">Online</span>
        </div>
      </header>

      {/* Two-panel body */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left — Avatar (40%) */}
        <div className="w-2/5 bg-[#1C1410] flex flex-col items-center justify-center gap-6">

          {/* Pulse ring + avatar circle */}
          <div className="relative flex items-center justify-center">
            {/* Outer pulse ring */}
            <span className="absolute w-56 h-56 rounded-full border border-amber-700/30 animate-ping" style={{ animationDuration: '2.5s' }} />
            {/* Mid ring */}
            <span className="absolute w-52 h-52 rounded-full border border-amber-700/20" />
            {/* Avatar circle */}
            <div className="w-44 h-44 rounded-full border border-stone-600 bg-[#241C16] flex items-center justify-center z-10">
              <span className="text-stone-500 text-xs text-center px-4 leading-snug">
                Avatar coming soon
              </span>
            </div>
          </div>

          {/* Name + title */}
          <div className="text-center">
            <p className="text-white text-2xl" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
              Lulama
            </p>
            <p className="text-amber-600/80 text-xs tracking-widest uppercase mt-1" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
              Community Worker · Khayelitsha
            </p>
          </div>

        </div>

        {/* Right — Chat (60%) */}
        <div className="w-3/5 bg-[#FAF6F0] flex flex-col">

          {/* Intro card — centred in the panel until chat begins */}
          <div className="flex-1 flex items-center justify-center px-10">
            <div className="max-w-md w-full">

              {/* Avatar chip */}
              <div className="flex items-center gap-3 mb-4">
                <div className="w-9 h-9 rounded-full bg-[#1C1410] border border-stone-600 flex items-center justify-center shrink-0">
                  <span className="text-stone-500 text-[8px]">L</span>
                </div>
                <div>
                  <p className="text-stone-800 text-sm font-medium leading-none" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>Lulama</p>
                  <p className="text-stone-400 text-xs mt-0.5">CHOSA · Khayelitsha</p>
                </div>
              </div>

              {/* Message bubble */}
              <div className="bg-white rounded-2xl rounded-tl-sm px-5 py-4 shadow-sm border border-stone-100">
                <p className="text-stone-700 text-sm leading-relaxed" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
                  Molo. My name is Lulama — I'm a community worker based in Khayelitsha, Cape Town.
                </p>
                <p className="text-stone-700 text-sm leading-relaxed mt-3" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
                  I work with CHOSA every day — in the schools, the feeding programmes, the safe spaces we've built for children who have nothing else. I want to tell you what that looks like up close.
                </p>
                <p className="text-stone-700 text-sm leading-relaxed mt-3" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
                  Will you listen?
                </p>
              </div>

              {/* Timestamp */}
              <p className="text-stone-300 text-xs mt-2 ml-1">Just now</p>

            </div>
          </div>

        </div>

      </div>
    </div>
  )
}
