// useYouTubePlayer: makes the YouTube player programmable.
//
// A normal <iframe> is a black box — our code cannot press its play button.
// The official "IFrame Player API" fixes that: it swaps a div for the
// iframe and gives us a player object with playVideo(), pauseVideo(),
// seekTo(), loadVideoById() and getCurrentTime().
//
// Failure behavior: every way this can fail is SURFACED in `playerError`
// (shown in the UI) — a blocked script, a slow network, a refused embed.
// Nothing here is allowed to fail silently.
import { useEffect, useMemo, useRef, useState } from 'react'

// YouTube tells us it is ready by calling this global function.
let apiPromise = null
const API_TIMEOUT_MS = 10000

const loadYouTubeApi = () => {
  if (window.YT && window.YT.Player) {
    return Promise.resolve()
  }
  if (apiPromise === null) {
    apiPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        apiPromise = null // allow a retry on the next video attempt
        reject(new Error('The YouTube player took too long to load.'))
      }, API_TIMEOUT_MS)

      window.onYouTubeIframeAPIReady = () => {
        clearTimeout(timeout)
        resolve()
      }

      const script = document.createElement('script')
      script.src = 'https://www.youtube.com/iframe_api'
      script.onerror = () => {
        clearTimeout(timeout)
        apiPromise = null // allow a retry
        reject(new Error('Could not load the YouTube player script (blocked or offline?).'))
      }
      document.body.appendChild(script)
    })
  }
  return apiPromise
}

// YouTube's numeric player states, only the ones we use.
// UNSTARTED/BUFFERING/CUED matter to the sync hook: a guest player that is
// still UNSTARTED (or BUFFERING/CUED) must not be "corrected" while it is
// still trying to follow the last instruction.
// Re-exported so the facade (src/video/index.js) can hand both out of
// one door. Everything else imports from the facade only.
export { extractVideoId } from './videoId.js'

export const PLAYER_STATE = {
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  CUED: 5,
  UNSTARTED: -1,
}

const useYouTubePlayer = (videoId, onStateChange, isHost = false, externalMountRef = null) => {
  // Attach this ref to a <div> — the player is created inside it.
  const mountRef = externalMountRef ?? useRef(null)
  const playerRef = useRef(null)
  // The div WE created for the player (we must only ever remove our own
  // node — the frame may also contain React-managed children).
  const mountNodeRef = useRef(null)
  // Guards against two interleaved creations (StrictMode, fast flips).
  const isCreatingRef = useRef(false)
  const [playerError, setPlayerError] = useState(null)
  // True once the YouTube player object exists and accepts commands.
  const [isReady, setIsReady] = useState(false)

  // Keep the latest callback without re-creating the player when the
  // parent re-renders (classic "latest ref" pattern).
  const stateChangeRef = useRef(onStateChange)
  useEffect(() => {
    stateChangeRef.current = onStateChange
  }, [onStateChange])

  useEffect(() => {
    let cancelled = false

    const ensureMountNode = () => {
      if (!mountRef.current) {
        return null
      }

      if (!mountNodeRef.current) {
        const mount = document.createElement('div')
        mount.style.width = '100%'
        mount.style.height = '100%'
        mountRef.current.appendChild(mount)
        mountNodeRef.current = mount
      }

      return mountNodeRef.current
    }

    if (videoId === null) {
      if (playerRef.current) {
        try {
          playerRef.current.destroy()
        } catch (destroyError) {
          // the player was already gone — nothing to do
        }
        playerRef.current = null
      }

      // Keep the mount container stable so the next room state can mount a
      // fresh player without a hard refresh. We only clear the slot if it is
      // still present and the parent is attached.
      if (mountNodeRef.current && mountRef.current?.contains(mountNodeRef.current)) {
        mountNodeRef.current.innerHTML = ''
      }
      setPlayerError(null)
      setIsReady(false)
      return undefined
    }

    setPlayerError(null)

    loadYouTubeApi()
      .then(() => {
        if (cancelled || isCreatingRef.current) {
          return
        }

        const mount = ensureMountNode()
        if (!mount) {
          return
        }

        if (playerRef.current) {
          playerRef.current.loadVideoById(videoId)
          return
        }

        isCreatingRef.current = true
        new window.YT.Player(mount, {
          videoId,
          width: '100%',
          height: '100%',
          playerVars: {
            playsinline: 1,
            rel: 0,
            controls: isHost ? 1 : 0,
            fs: isHost ? 1 : 0,
            disablekb: isHost ? 0 : 1,
            // Guests start MUTED: browsers refuse to autoplay unmuted
            // video with sound, and a blocked guest never syncs. Muted
            // autoplay is always allowed; the guest can unmute after.
            mute: isHost ? 0 : 1,
            origin: window.location.origin,
          },
          events: {
            onReady: (event) => {
              isCreatingRef.current = false
              playerRef.current = event.target
              setIsReady(true)
            },
            onStateChange: (event) => {
              stateChangeRef.current?.(event.data)
            },
            onError: () => {
              isCreatingRef.current = false
              setPlayerError(
                'YouTube refused this video (it may be private, deleted, or not embeddable).',
              )
            },
          },
        })
      })
      .catch((apiError) => {
        if (!cancelled) {
          setPlayerError(apiError.message)
        }
      })

    return () => {
      cancelled = true
    }
  }, [videoId])

  // Final cleanup: destroy the player when the page goes away.
  useEffect(() => {
    return () => {
      if (playerRef.current) {
        try {
          playerRef.current.destroy()
        } catch (destroyError) {
          // ignore — the player is already gone
        }
        playerRef.current = null
      }
    }
  }, [])

  const controls = useMemo(
    () => ({
      play: () => playerRef.current?.playVideo?.(),
      pause: () => playerRef.current?.pauseVideo?.(),
      seekTo: (seconds) => playerRef.current?.seekTo?.(seconds, true),
      loadVideo: (id) => playerRef.current?.loadVideoById?.(id),
      getCurrentTime: () => playerRef.current?.getCurrentTime?.() ?? 0,
      getDuration: () => playerRef.current?.getDuration?.() ?? 0,
      isPlaying: () => playerRef.current?.getPlayerState?.() === PLAYER_STATE.PLAYING,
      // Paused BY STATE, not just "not playing": buffering also reads as
      // not-playing, but only a real PAUSED means the user (or browser)
      // deliberately stopped — the sync hook treats the two differently.
      isPaused: () => playerRef.current?.getPlayerState?.() === PLAYER_STATE.PAUSED,
      // Sound: guests start muted (browser autoplay rules) and can
      // unmute with one click once the video is running.
      setMuted: (muted) => playerRef.current?.[muted ? 'mute' : 'unMute']?.(),
      isMuted: () => playerRef.current?.isMuted?.() ?? true,
      // Speed control. YouTube's iframe API supports DISCRETE speeds
      // (0.75 / 1 / 1.25 ...), which is why the sync math only nudges
      // the rate when the provider declares continuous-rate support.
      setPlaybackRate: (rate) => playerRef.current?.setPlaybackRate?.(rate),
      getPlaybackRate: () => playerRef.current?.getPlaybackRate?.() ?? 1,
    }),
    [],
  )

  return { mountRef, controls, playerError, isReady }
}

export default useYouTubePlayer

// The facade (src/video/index.js) hands this hook out under the
// provider-neutral name useVideoPlayer.
export { useYouTubePlayer as useVideoPlayer }
