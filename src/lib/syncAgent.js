// ============================================================
// syncAgent — the SOLE sync logic of Watch Party
// ============================================================
// One idea, one file: everyone agrees on an ANCHOR — "at anchor
// time T, the video was at position P, playing at rate R" — and
// every screen continuously steers its player onto the anchor
// timeline. This replaces and removes every previous mechanism:
// the 500ms guest tick, the 3s heartbeat, the seek detector,
// controller grace, the watchdog, and the settle timers.
//
// Anchoring on RECEPTION (user-ratified): the anchor time is WHEN
// THIS DEVICE RECEIVED the row, so each device's clock offset vs
// the server cancels out of the equation — no server clock needed.
//
// Adapted from the user-provided SynchronizedVideoAgent:
// - 250ms evaluation loop
// - hard seek when |delta| > 1.25s
// - proportional rate nudge (kp = 0.08, clamped 0.92–1.08) — only
//   when the provider declares continuous-rate support (YouTube
//   cannot: its iframe snaps rates to 0.75/1/1.25, so on YouTube
//   the agent simply HOLDS inside the threshold)
// - host seek detection: a playing host that jumps > 1.25s from
//   its own anchor becomes the new anchor for the whole room
import { PLAYER_STATE } from '../video/index.js'

// The evaluation cadence: five times a second would be jittery;
// once a second would lag. 250ms is the reference design.
export const SYNC_INTERVAL_MS = 250
// |delta| beyond this forces an instant seek onto the anchor.
export const HARD_SYNC_THRESHOLD_SECONDS = 1.25
// Proportional gain for the soft rate nudge, and its bounds.
export const SYNC_KP = 0.08
export const MIN_NUDGE_RATE = 0.92
export const MAX_NUDGE_RATE = 1.08

// Should the soft rate nudge be used at all? The provider answers:
// YouTube's iframe player only accepts DISCRETE speeds, so a 1.03x
// nudge would snap to a wrong audible speed — the agent holds speed
// and waits for the hard threshold instead. A future plain-video
// provider (a raw <video> element) flips this flag and gets true
// soft sync for free.
export const shouldNudgeRate = (supportsContinuousRate) => supportsContinuousRate === true

// Keep a nudged rate inside the inaudible window.
const clampRate = (rate) => Math.max(MIN_NUDGE_RATE, Math.min(MAX_NUDGE_RATE, rate))

// Build the anchor state from a room row + when THIS device got it.
const buildRoomState = (row, receivedAtMs) => ({
  isPlaying: row.is_playing === true,
  anchorVideoTime:
    typeof row.position_seconds === 'number' ? row.position_seconds : 0,
  anchorReceivedAtMs: receivedAtMs,
  // The room's shared playback speed. A missing column (older database,
  // pre-migration) falls back to 1.0, so nothing breaks.
  playbackRate:
    typeof row.playback_rate === 'number' && row.playback_rate > 0
      ? row.playback_rate
      : 1.0,
})

// Where should the video be RIGHT NOW on the anchor timeline?
// Playing rows fast-forward from the anchor AT THE ROOM'S PLAYBACK
// RATE; paused rows sit still.
// (Reception anchor: `anchorReceivedAtMs` is when this device got
// the row, so elapsed time is measured on this device's own clock
// — the cross-device offset is identical on both sides of the sum
// and cancels.)
const expectedVideoTime = (roomState, nowMs) => {
  if (!roomState.isPlaying) {
    return roomState.anchorVideoTime
  }
  const elapsedSeconds = Math.max(0, (nowMs - roomState.anchorReceivedAtMs) / 1000)
  return roomState.anchorVideoTime + elapsedSeconds * roomState.playbackRate
}

// The decision the 250ms loop acts on: return the exact command for
// the player (pure — the test suite drives this function directly).
//   1. truth or player paused -> 'none' (the intent side handles it)
//   2. |delta| > threshold    -> HARD seek onto the anchor
//   3. provider can nudge     -> soft rate correction (clamped)
//   4. otherwise              -> hold speed (YouTube's path)
const evaluate = ({ roomState, nowMs, playerTimeSeconds, playerIsPlaying, supportsContinuousRate }) => {
  const targetTime = expectedVideoTime(roomState, nowMs)
  const delta = targetTime - playerTimeSeconds

  if (!roomState.isPlaying || !playerIsPlaying) {
    return { targetTime, delta, action: 'none', rate: null }
  }
  if (Math.abs(delta) > HARD_SYNC_THRESHOLD_SECONDS) {
    return { targetTime, delta, action: 'seek', rate: roomState.playbackRate }
  }
  if (shouldNudgeRate(supportsContinuousRate)) {
    return {
      targetTime,
      delta,
      action: 'nudge',
      rate: clampRate(roomState.playbackRate + delta * SYNC_KP),
    }
  }
  return { targetTime, delta, action: 'hold', rate: null }
}

// A playing HOST that jumped away from its own anchor (bar-seek) —
// it becomes the new anchor for the whole room. Mirrors the agent's
// createHostActionPayload('SEEK'): the host player is the source.
// The PLAYER must actually be playing: a paused player against a stale
// playing row is a pause in flight, never a seek — treating it as one
// would write "playing" back over the host's fresh pause.
const hostSeeked = ({ roomState, nowMs, playerTimeSeconds, playerIsPlaying }) => {
  if (!roomState.isPlaying || playerIsPlaying !== true) {
    return false
  }
  const expected = expectedVideoTime(roomState, nowMs)
  return Math.abs(playerTimeSeconds - expected) > HARD_SYNC_THRESHOLD_SECONDS
}

// GUARD against the refreshed host: a PLAYING event whose player position
// badly contradicts the anchor timeline is a STALE artifact of a fresh page
// load (the player starts at 0:00), never a real decision — so it must not
// be blessed into the row. Deliberate host moves stay legal:
// - a real bar-seek is NOT an event contradiction; the host's own seek
//   detector writes it (and would never travel through this path),
// - a deliberate restart is pause -> drag to 0 -> play (a PAUSED intent
//   moves the row first, so the anchor is already at ~0 when PLAYING fires).
const CONTRADICTION_FLOOR_SECONDS = 5
const shouldWritePlayingIntent = ({ roomState, nowMs, playerTimeSeconds }) => {
  if (!roomState.isPlaying) {
    return true // resuming a paused room: always take the host's word
  }
  const expected = expectedVideoTime(roomState, nowMs)
  // The fresh-load artifact is NEAR ZERO (the player just loaded); a real
  // jump that far behind the timeline would be a seek and is handled by
  // the host's own detector. So: only reject when the position sits in
  // the contradiction window AND the timeline is nowhere near it.
  if (playerTimeSeconds > CONTRADICTION_FLOOR_SECONDS) {
    return true
  }
  return Math.abs(expected - playerTimeSeconds) <= HARD_SYNC_THRESHOLD_SECONDS
}

// Which guest state events does the agent still forward as intents?
// Inside the window the agent deliberately does NOT correct (no
// command churn), so a mismatch with the row must surface — e.g. a
// guest that fell out of step and needs a row-correcting seek.
const isReportableIntent = (playerState) =>
  playerState === PLAYER_STATE.PLAYING ||
  playerState === PLAYER_STATE.PAUSED ||
  playerState === PLAYER_STATE.ENDED

export {
  clampRate,
  buildRoomState,
  expectedVideoTime,
  evaluate,
  hostSeeked,
  isReportableIntent,
  shouldWritePlayingIntent,
}
