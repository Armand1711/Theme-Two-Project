import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'

const Avatar = forwardRef(function Avatar(_props, ref) {
  const containerRef = useRef(null)
  const headRef = useRef(null)

  // Expose speak() so the parent can call avatarRef.current.speak(text)
  useImperativeHandle(ref, () => ({
    speak(text) {
      headRef.current?.speakText(text)
    },
  }))

  useEffect(() => {
    let cancelled = false

    async function init() {
      // @vite-ignore: loaded directly from CDN, not bundled by Vite
      const { TalkingHead } = await import(
        /* @vite-ignore */
        'https://cdn.jsdelivr.net/gh/met4citizen/TalkingHead@1.7/modules/talkinghead.mjs'
      )

      if (cancelled || !containerRef.current) return

      const head = new TalkingHead(containerRef.current, {
        ttsEndpoint: null,   // no cloud TTS — browser Web Speech API only
        lipsyncModules: ['en'],
        cameraView: 'upper',
      })

      headRef.current = head

      await head.showAvatar(
        {
          url: '/models/brunette.glb',
          body: 'F',
          avatarMood: 'neutral',
          lipsyncLang: 'en',
          ttsLang: 'en-GB',
          baseline: {
            headRotateX: -0.05,
            eyeBlinkLeft: 0.15,
            eyeBlinkRight: 0.15,
          },
        },
        (ev) => {
          if (ev.type === 'progress' && ev.detail?.total) {
            const pct = Math.round((ev.detail.loaded / ev.detail.total) * 100)
            console.log(`Loading avatar: ${pct}%`)
          }
        }
      )
    }

    init().catch((err) => console.error('TalkingHead init failed:', err))

    return () => {
      cancelled = true
      const h = headRef.current
      if (h) {
        try { h.stopSpeaking?.() } catch {}
        try { h.stop?.() } catch {}
        headRef.current = null
      }
    }
  }, [])

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', background: '#1C1410', overflow: 'hidden' }}
    />
  )
})

export default Avatar