// usePlaybackSync: the thin React adapter around the SYNC AGENT
// (src/lib/syncAgent.js). The agent is the SOLE sync logic — this
// file contains no sync math of its own. It only:
//   1. turns each room row into the agent's anchor state,
//   2. runs the agent's 250ms loop and executes its commands,
//   3. forwards host intents into the row (guests never write),
//   4. keeps the PRODUCT behaviors: guests parked until they click
//      "Join the video", the one-click join, and the loading
//      overlays — which now hide when the agent CONVERGES instead
//      of on fixed timers.
//
// Every previous sync mechanism is gone: the 500ms guest tick, the
// 3s heartbeat, the 1s seek detector, controller grace, monotonic
// row filtering, the silence watchdog, and the settle timers.
import { useEffect, useRef, useState } from 'react'
import { updatePlaybackState } from '../lib/rooms.js'
import {
  buildRoomState,
  evaluate,
  expectedVideoTime,
  hostSeeked,
  isReportableIntent,
  shouldWritePlayingIntent,
  HARD_SYNC_THRESHOLD_SECONDS,
  SYNC_INTERVAL_MS,
} from '../lib/syncAgent.js'
import { PLAYER_STATE, PROVIDER_CAPABILITIES } from '../video/index.js'

// A guest who is playing but MUTED gets the one-click join overlay
// after this long — the sound path. (Product timing, not sync.)
const JOIN_OVERLAY_AFTER_MS = 1200

const usePlaybackSync = ({
  roomId,
  room,
  isHost,
  controls,
  isPlayerReady,
  // Called the moment the host SENDS a playback write, so the room page
  // can open its grace window (poll hold-off) at the click, not a
  // round-trip later.
  onPlaybackWrite = () => {},
}) => {
  // The agent's anchor state: { isPlaying, anchorVideoTime,
  // anchorReceivedAtMs, playbackRate }. Reception-anchored: the
  // anchor time is when THIS device received the row.
  const roomStateRef = useRef(null)
  // Which video the agent's anchor describes (for video swaps).
  const anchoredVideoRef = useRef(null)
  // Which video the player has actually been handed (load-once).
  const loadedVideoRef = useRef(null)
  // Play/pause we already commanded, so applies never loop.
  const appliedRef = useRef({ videoId: null, isPlaying: null })
  // Has this host's player started THIS video? Gates the "Starting the
  // video..." overlay AND seek detection: until the host's first real
  // play, there is no lived-in timeline to detect seeks against.
  const hostStartedVideoRef = useRef(null)
  // Guest: how long it has been playing muted (overlay timer).
  const mutedSinceRef = useRef(null)
  // CLIENT DEFAULT = PAUSED: guests stay parked until they click
  // "Join the video". Opting in survives video changes; resets on
  // page load. (Product behavior — unchanged.)
  const hasOptedInRef = useRef(false)
  const [needsJoinOverlay, setNeedsJoinOverlay] = useState(false)
  const [isJoining, setIsJoining] = useState(false)

  // Host-side database write. Guests never reach the network with a
  // playback write (the database would refuse it anyway).
  // The player's CURRENT speed rides along by default: every playback
  // write carries the room's speed, so a guest joining (or re-syncing)
  // always lands on the host's video options.
  const writePlaybackState = (
    isPlaying,
    positionSeconds,
    playbackRate = controls.getPlaybackRate(),
  ) => {
    if (!isHost || roomId === null || roomId === undefined) {
      return
    }
    onPlaybackWrite() // the state just changed — start the grace window
    updatePlaybackState(roomId, { isPlaying, positionSeconds, playbackRate })
  }

  // ------------------------------------------------------------
  // APPLY A ROW: build the new anchor, then make the player obey
  // its structural parts (which video, play vs pause, and — for
  // paused or freshly-starting players — where). The agent loop
  // owns everything that happens DURING playback.
  // ------------------------------------------------------------
  const applyTruthRef = useRef(null)
  applyTruthRef.current = () => {
    const roomState = roomStateRef.current
    if (roomState === null) {
      return
    }
    const videoId = anchoredVideoRef.current

    if (videoId === null) {
      appliedRef.current = { videoId: null, isPlaying: null }
      loadedVideoRef.current = null
      setNeedsJoinOverlay(false)
      return
    }
    if (!isPlayerReady) {
      return // the player hook creates the player WITH this video
    }

    // Which video the player holds: load once, then swap on change.
    if (loadedVideoRef.current !== videoId) {
      if (loadedVideoRef.current === null) {
        // The player was created with this video already.
      } else {
        controls.loadVideo(videoId)
      }
      loadedVideoRef.current = videoId
      appliedRef.current.isPlaying = null
      if (isHost) {
        hostStartedVideoRef.current = null
      }
    }

    if (isHost) {
      // HOST obey-side: play/pause once per change; position only
      // while paused or starting — a PLAYING host is the source of
      // the anchor (the agent loop detects its seeks instead).
      const playerIsPlaying = controls.isPlaying()
      const rowIsPlaying = roomState.isPlaying
      // Speed: a paused or fresh-load host ADOPTS the row's shared
      // speed (it must land on the party's options). A playing, armed
      // host is the live source — its own menu choice is never dragged
      // back by a row it wrote itself.
      const rowRate = roomState.playbackRate
      if (
        (!playerIsPlaying || hostStartedVideoRef.current === null) &&
        Math.abs(controls.getPlaybackRate() - rowRate) > 0.001
      ) {
        controls.setPlaybackRate(rowRate)
      }
      if (appliedRef.current.isPlaying !== rowIsPlaying) {
        if (rowIsPlaying && !playerIsPlaying) {
          controls.play()
        } else if (!rowIsPlaying && playerIsPlaying) {
          controls.pause()
        }
        appliedRef.current.isPlaying = rowIsPlaying
      }
      if (!rowIsPlaying || !controls.isPlaying()) {
        const expected = expectedVideoTime(roomState, Date.now())
        const current = controls.getCurrentTime()
        if (Math.abs(current - expected) > HARD_SYNC_THRESHOLD_SECONDS) {
          controls.seekTo(expected)
        }
      }
      return
    }

    // GUEST obey-side.
    if (!hasOptedInRef.current) {
      // Parked: paused (quietly), overlay offered when the party is
      // live. The click IS the opt-in.
      if (controls.isPlaying()) {
        controls.pause()
      }
      appliedRef.current.isPlaying = false
      setNeedsJoinOverlay(roomState.isPlaying)
      return
    }

    // Opted in: follow the row's play/pause (once per change) and the
    // row's speed — the host owns every video option.
    const rowIsPlaying = roomState.isPlaying
    if (appliedRef.current.isPlaying !== rowIsPlaying) {
      if (rowIsPlaying && !controls.isPlaying()) {
        controls.play()
      } else if (!rowIsPlaying && controls.isPlaying()) {
        controls.pause()
      }
      appliedRef.current.isPlaying = rowIsPlaying
    }
    const rowRate = roomState.playbackRate
    if (Math.abs(controls.getPlaybackRate() - rowRate) > 0.001) {
      controls.setPlaybackRate(rowRate)
    }
  }

  useEffect(() => {
    if (room === null || room === undefined) {
      return
    }
    // PROTECTION 1 (the agent's): every row becomes the anchor. The
    // room page's staleness guard already filters old polls, and a
    // host intent that echoes back just re-anchors the same truth.
    roomStateRef.current = buildRoomState(room, Date.now())
    anchoredVideoRef.current = room.active_video_id ?? null
    applyTruthRef.current()
  }, [room, isPlayerReady])

  // ------------------------------------------------------------
  // THE AGENT LOOP — one 250ms interval for every screen.
  // Host: detect its seeks (it re-anchors the room). Guest: execute
  // the agent's sync decision. Also handles overlay convergence.
  // ------------------------------------------------------------
  useEffect(() => {
    if (isPlayerReady === undefined || isPlayerReady === false) {
      return undefined
    }
    const interval = setInterval(() => {
      let roomState = roomStateRef.current
      if (roomState === null || anchoredVideoRef.current === null) {
        return
      }
      // A host pause must win IMMEDIATELY. The database write for a
      // pause is not instant — until the re-anchored row arrives, the
      // local anchor still says "playing", and two spots below would
      // fight the pause: the play-retry branch (it would force play
      // back on and re-buffer, which showed as a loading flash) and
      // the seek detector (a paused player against a playing row
      // reads as a jump). Mirroring the pause into the local anchor
      // makes both stand down for the few ms the write needs.
      const hostPausedSelf =
        isHost &&
        roomState.isPlaying &&
        hostStartedVideoRef.current !== null &&
        controls.isPaused() // PAUSED only — buffering must NOT count
      if (hostPausedSelf) {
        roomStateRef.current = { ...roomState, isPlaying: false }
        roomState = roomStateRef.current // same-tick: the branches below see it
      }
      const nowMs = Date.now()
      const playerTimeSeconds = controls.getCurrentTime()
      const playerIsPlaying = controls.isPlaying()

      if (isHost) {
        // Retry a refused play (fresh page loads can block it) until
        // the row's intent is actually running on the host player.
        if (roomState.isPlaying && !playerIsPlaying && appliedRef.current.isPlaying === true) {
          controls.play()
          return
        }
        // Host overlay: "Starting the video..." until the FIRST
        // play of this video actually happens (convergence, not a
        // fixed timer). Arming happens BEFORE seek detection so the
        // detection below starts from an armed state and never fires
        // from a fresh-load artifact.
        if (
          roomState.isPlaying &&
          hostStartedVideoRef.current === null &&
          playerIsPlaying
        ) {
          // Landing vs steering: an UNARMED playing host far from the
          // anchor is a fresh page load landing mid-party — align THIS
          // host onto the live timeline (never write: its ~0:00 is a
          // load artifact). Once playing ALONG the timeline, arm: from
          // then on a jump means the host dragged the bar (seek
          // detection below), so it becomes the new anchor for all.
          const expected = expectedVideoTime(roomState, nowMs)
          if (Math.abs(playerTimeSeconds - expected) > HARD_SYNC_THRESHOLD_SECONDS) {
            controls.seekTo(expected)
          } else {
            hostStartedVideoRef.current = anchoredVideoRef.current // armed
          }
          setIsJoining(true) // landing until armed (hidden once armed)
          return
        }
        // Host seek detection: a playing host far from its own
        // anchor just seeked — write the new anchor for everyone.
        // The landing branch above keeps unarmed (fresh-load) hosts
        // out of here, so the detector never fires from an artifact.
        if (
          hostStartedVideoRef.current !== null &&
          hostSeeked({
            roomState,
            nowMs,
            playerTimeSeconds,
            playerIsPlaying,
          })
        ) {
          writePlaybackState(true, playerTimeSeconds)
        }
        setIsJoining(
          roomState.isPlaying && hostStartedVideoRef.current === null,
        )
        return
      }

      // GUEST — parked screens stay parked (the agent idles), but they
      // still ADOPT the room's options: the shared speed and a pre-seek
      // to the live position. A fresh player sits at the video's
      // beginning at 1x — the "Join the video" click should land already
      // in step, not snap there afterwards.
      if (!hasOptedInRef.current) {
        if (playerIsPlaying) {
          controls.pause()
        }
        const targetRate = roomState.playbackRate
        if (Math.abs(controls.getPlaybackRate() - targetRate) > 0.001) {
          controls.setPlaybackRate(targetRate)
        }
        const targetTime = expectedVideoTime(roomState, nowMs)
        if (Math.abs(playerTimeSeconds - targetTime) > HARD_SYNC_THRESHOLD_SECONDS) {
          controls.seekTo(targetTime)
        }
        mutedSinceRef.current = null
        return
      }

      if (!roomState.isPlaying) {
        // Truth paused: be paused. (Position is applied on row
        // change; no chasing while paused.)
        if (playerIsPlaying) {
          controls.pause()
          appliedRef.current.isPlaying = false
        }
        mutedSinceRef.current = null
        setNeedsJoinOverlay(false)
        setIsJoining(false) // nothing to converge on while paused
        return
      }

      // Truth playing: make sure we are playing (play() retries are
      // harmless), then run the agent's sync decision.
      if (!playerIsPlaying) {
        controls.play()
        mutedSinceRef.current = null
        return
      }

      // Playing while muted = autoplay working; offer the one-click
      // sound path after ~1.2s muted.
      if (controls.isMuted()) {
        if (mutedSinceRef.current === null) {
          mutedSinceRef.current = nowMs
        } else if (nowMs - mutedSinceRef.current > JOIN_OVERLAY_AFTER_MS) {
          setNeedsJoinOverlay(true)
        }
      } else {
        mutedSinceRef.current = null
        setNeedsJoinOverlay(false)
      }

      const plan = evaluate({
        roomState,
        nowMs,
        playerTimeSeconds,
        playerIsPlaying,
        supportsContinuousRate: PROVIDER_CAPABILITIES.supportsContinuousRate,
      })
      if (plan.action === 'seek') {
        controls.seekTo(plan.targetTime)
      } else if (plan.action === 'nudge') {
        controls.setPlaybackRate(plan.rate)
      }
      // 'hold' → nothing: the agent deliberately leaves the player
      // alone inside the threshold.

      // Convergence hides the join overlay (no fixed timers).
      if (isJoining && Math.abs(plan.delta) <= HARD_SYNC_THRESHOLD_SECONDS) {
        setIsJoining(false)
      }
    }, SYNC_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [isPlayerReady, isHost, controls, isJoining])

  // ------------------------------------------------------------
  // INTENTS. Host: play/pause/end events write the row (the agent
  // has no grace windows — a host pause is a host pause). Guest:
  // state events only re-apply the latest anchor; they never write.
  // ------------------------------------------------------------
  const writeIntentRef = useRef(null)
  writeIntentRef.current = (playerState) => {
    writePlaybackState(
      playerState === PLAYER_STATE.PLAYING,
      controls.getCurrentTime(),
      controls.getPlaybackRate(),
    )
  }

  const handlePlayerStateChange = (playerState) => {
    if (!isReportableIntent(playerState)) {
      return // BUFFERING/UNSTARTED are noise, not decisions
    }
    if (isHost) {
      // The refreshed-host guard: a PLAYING event that contradicts the
      // anchor timeline (a fresh player's ~0:00 against a party minutes
      // in) is a page-load artifact, not a decision — writing it would
      // restart the video on EVERY screen. The host keeps obeying the
      // row; a deliberate restart (pause, drag to 0, play) stays legal.
      if (
        playerState === PLAYER_STATE.PLAYING &&
        roomStateRef.current !== null &&
        !shouldWritePlayingIntent({
          roomState: roomStateRef.current,
          nowMs: Date.now(),
          playerTimeSeconds: controls.getCurrentTime(),
        })
      ) {
        return
      }
      writeIntentRef.current(playerState)
      return
    }
    applyTruthRef.current()
  }

  // The "Join the video" click (guests only): the opt-in. Unmuting
  // MUST happen inside the click (the browser's user-gesture rule),
  // then the row-apply and the agent loop land the seek + play.
  const joinPlayback = () => {
    hasOptedInRef.current = true
    controls.setMuted(false)
    // Land on ALL of the room's options inside the same click: the
    // shared SPEED first, then the live position. The parked loop
    // keeps these fresh, but the click is the gate through which
    // playing ever starts — nothing may play from a stale option.
    if (roomStateRef.current !== null && anchoredVideoRef.current !== null) {
      controls.setPlaybackRate(roomStateRef.current.playbackRate)
      controls.seekTo(expectedVideoTime(roomStateRef.current, Date.now()))
    }
    mutedSinceRef.current = null
    setNeedsJoinOverlay(false)
    setIsJoining(true)
    appliedRef.current.isPlaying = null // force a fresh apply
    applyTruthRef.current()
  }

  return { handlePlayerStateChange, needsJoinOverlay, isJoining, joinPlayback }
}

export default usePlaybackSync
