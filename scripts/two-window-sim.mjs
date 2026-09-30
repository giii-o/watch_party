// TWO-WINDOW SIMULATION — the sync AGENT (anchor + 250ms loop).
//
// Simulates the host window and a guest window against one shared room
// row, using the app's REAL decision functions (src/lib/syncAgent.js)
// and faithful mirrors of the app's loops: the agent's 250ms interval
// on both screens, host intents writing the row, and the 2s poll.
//
// Assumptions for everything the sim cannot know:
//   realtime push latency  80ms   (Supabase is typically 50-200ms)
//   YouTube seek buffer    800ms  (varies with network)
// Run with:  node scripts/two-window-sim.mjs
import {
  buildRoomState,
  evaluate,
  expectedVideoTime,
  hostSeeked,
  HARD_SYNC_THRESHOLD_SECONDS,
  SYNC_INTERVAL_MS,
} from '../src/lib/syncAgent.js'

const POLL_MS = 2000
const PUSH_LATENCY_MS = 80
const BUFFER_MS = 800
const PS = { PLAYING: 1, PAUSED: 2, BUFFERING: 3 }

// ---------- shared row ----------
let row = { active_video_id: 'abc', is_playing: false, position_seconds: 0, state_updated_at: '' }
let guestAppliedStamp = ''
let guestTruth = null // the guest's anchor: { row, receivedAt }
let pollQueue = []
let pushQueue = []

const stampOf = (t) => `T${String(t).padStart(6, '0')}`
const writeRow = (t, isPlaying, position) => {
  row = { ...row, is_playing: isPlaying, position_seconds: position, state_updated_at: stampOf(t) }
  pushQueue.push({ at: t + PUSH_LATENCY_MS, row })
  host.anchor = { pos: position, at: t } // the host's own anchor
}

const guestReceivesRow = (t, delivered) => {
  if (delivered.row.state_updated_at <= guestAppliedStamp) {
    return // the room page's staleness guard
  }
  guestAppliedStamp = delivered.row.state_updated_at
  guestTruth = { row: delivered.row, receivedAt: t }
}

// ---------- host window ----------
const host = {
  pos: 0,
  playing: false,
  anchor: { pos: 0, at: 0 },
  intent(t, playerState) {
    this.playing = playerState === 1
    writeRow(t, this.playing, this.pos)
    return `wrote ${this.playing ? 'PLAYING' : 'PAUSED'} @ ${this.pos.toFixed(1)}s`
  },
  tick(t) {
    if (this.playing) {
      this.pos += SYNC_INTERVAL_MS / 1000
    }
    // AGENT: a playing host far from its own anchor just seeked.
    const rs = {
      isPlaying: this.playing,
      anchorVideoTime: this.anchor.pos,
      anchorReceivedAtMs: this.anchor.at,
      playbackRate: 1.0,
    }
    if (hostSeeked({ roomState: rs, nowMs: t, playerTimeSeconds: this.pos, playerIsPlaying: this.playing })) {
      writeRow(t, true, this.pos) // re-anchor the whole room NOW
    }
  },
}

// ---------- guest window ----------
const guest = {
  state: PS.PAUSED,
  pos: 0,
  muted: true,
  optedIn: false,
  isJoining: false,
  pendingSeek: null,
  bufferReadyAt: null,
  pollAt: 0,
  join(t) {
    this.optedIn = true
    this.isJoining = true
    this.muted = false // the user gesture
  },
  seekTo(seconds, t) {
    this.pendingSeek = seconds
    this.bufferReadyAt = t + BUFFER_MS
    this.state = PS.BUFFERING
  },
  advance(t) {
    if (this.state === PS.BUFFERING && t >= this.bufferReadyAt) {
      this.pos = this.pendingSeek
      this.state = PS.PLAYING
    }
    if (this.state === PS.PLAYING) {
      this.pos += SYNC_INTERVAL_MS / 1000
    }
  },
  tick(t) {
    if (this.state === PS.BUFFERING && t < this.bufferReadyAt) {
      return { overlay: this.isJoining } // buffering: hands off
    }
    if (guestTruth === null || guestTruth.row.active_video_id == null) {
      return { overlay: false }
    }
    const truth = guestTruth.row

    if (!this.optedIn) {
      // CLIENT DEFAULT = PAUSED: parked; the overlay IS the opt-in.
      if (this.state === PS.PLAYING) {
        this.state = PS.PAUSED
      }
      return { overlay: truth.is_playing === true }
    }

    if (!truth.is_playing) {
      if (this.state === PS.PLAYING) {
        this.state = PS.PAUSED
        this.pos = truth.position_seconds
      }
      this.isJoining = false
      return { overlay: false }
    }

    if (this.state !== PS.PLAYING) {
      this.state = PS.PLAYING // the play retry (accepted in the sim)
      return { overlay: this.isJoining }
    }

    // AGENT: the sync decision.
    const rs = buildRoomState(truth, guestTruth.receivedAt)
    const plan = evaluate({
      roomState: rs,
      nowMs: t,
      playerTimeSeconds: this.pos,
      playerIsPlaying: true,
      supportsContinuousRate: false,
    })
    if (plan.action === 'seek') {
      this.seekTo(plan.targetTime, t)
    }
    // Convergence hides the "Joining the video..." overlay.
    if (this.isJoining && Math.abs(plan.delta) <= HARD_SYNC_THRESHOLD_SECONDS) {
      this.isJoining = false
    }
    return { overlay: false }
  },
}

// ---------- run the flow ----------
const log = []
const mark = (t, label, detail = '') => log.push({ t, label, detail })

writeRow(0, true, 0) // host starts the party (updateActiveVideo)
host.playing = true // the host's player autoplays what it just set
mark(0, 'HOST sets the video', 'row: playing @ 0s; host player starts')

const guestLoadedAt = 2000
mark(guestLoadedAt, 'GUEST page loads (fresh visitor)', 'client default = paused')

let overlayShownAt = null
const joinRequestedAt = 10000
let joinConvergedAt = null
let pauseLatency = null
let playLatency = null
const seekDragAt = 30000
let seekLandedAt = null
let lateJoinLandedAt = null
const hidePauseAt = 47000
let hidePauseLatency = null

for (let t = 0; t <= 50000; t += SYNC_INTERVAL_MS) {
  // deliver realtime pushes and the 2s poll
  pushQueue = pushQueue.filter((d) => {
    if (d.at <= t) {
      guestReceivesRow(t, d)
      return false
    }
    return true
  })
  if (t >= guestLoadedAt) {
    if (t >= guest.pollAt) {
      guest.pollAt = t + POLL_MS
      guestReceivesRow(t, { row })
    }
  }

  host.tick(t)
  if (t === 20000) mark(t, 'HOST presses pause', host.intent(t, 2))
  if (t === 25000) mark(t, 'HOST presses play', host.intent(t, 1))
  if (t === seekDragAt) {
    host.pos = 300 // the seek bar drag (no YouTube event fires)
    mark(t, 'HOST drags seek bar 30s -> 300s', 'no event fires; the agent detects it')
  }
  if (t === hidePauseAt) mark(t, 'HOST hides the tab', host.intent(t, 2))

  if (t >= guestLoadedAt) {
    guest.advance(t)
    const result = guest.tick(t)
    if (result.overlay && overlayShownAt === null) {
      overlayShownAt = t - guestLoadedAt
      mark(t, 'GUEST sees "Join the video"', `${overlayShownAt}ms after page load`)
    }
    if (t === joinRequestedAt) {
      guest.join(t) // the click actually happens
      mark(t, 'GUEST clicks "Join the video"', 'opt-in: play + unmute; the agent lands the seek')
    }
    if (
      joinConvergedAt === null &&
      guest.optedIn &&
      !guest.isJoining &&
      guest.state === PS.PLAYING &&
      !guest.muted &&
      Math.abs(guest.pos - host.pos) <= HARD_SYNC_THRESHOLD_SECONDS
    ) {
      joinConvergedAt = t
      mark(t, 'GUEST converged (agent)', `join click -> watching in sync: ${joinConvergedAt - joinRequestedAt}ms`)
    }
    if (pauseLatency === null && t > 20000 && t < 22000 && guest.optedIn && guest.state === PS.PAUSED) {
      pauseLatency = t - 20000
      mark(t, 'GUEST paused (after host pause)', `latency ${pauseLatency}ms`)
    }
    if (playLatency === null && t > 25000 && guest.state === PS.PLAYING) {
      playLatency = t - 25000
      mark(t, 'GUEST resumed (after host play)', `latency ${playLatency}ms`)
    }
    if (
      seekLandedAt === null &&
      t > seekDragAt + 2000 &&
      guest.state === PS.PLAYING &&
      Math.abs(guest.pos - host.pos) <= HARD_SYNC_THRESHOLD_SECONDS
    ) {
      seekLandedAt = t
      mark(t, 'GUEST tracking the new position', `seek latency ${seekLandedAt - seekDragAt}ms`)
    }
    if (hidePauseLatency === null && t > hidePauseAt && guest.state === PS.PAUSED) {
      hidePauseLatency = t - hidePauseAt
      mark(t, 'GUEST paused (host hid the tab)', `latency ${hidePauseLatency}ms`)
    }
  }
}

mark(50000, 'DONE', `final gap: ${Math.abs(host.pos - guest.pos).toFixed(2)}s`)

console.log('TWO-WINDOW SIMULATION — sync agent (anchor + 250ms loop)')
console.log(
  `assumptions: push ${PUSH_LATENCY_MS}ms, seek buffer ${BUFFER_MS}ms, agent loop ${SYNC_INTERVAL_MS}ms, poll ${POLL_MS}ms, hard threshold ${HARD_SYNC_THRESHOLD_SECONDS}s\n`,
)
for (const entry of log) {
  console.log(
    `t=${String(entry.t).padStart(6, '0')}ms  ${entry.label}${entry.detail ? `\n           ${entry.detail}` : ''}`,
  )
}

// Late-joiner sanity: the anchor math lands a fresh screen mid-video.
const lateRs = buildRoomState({ is_playing: true, position_seconds: 740 }, 0)
const lateTarget = expectedVideoTime(lateRs, 5000)
console.log(`\nlate joiner sanity: row says 740s playing; a screen joining 5s later targets ${lateTarget.toFixed(1)}s`)
assertLateJoin(lateTarget)

function assertLateJoin(target) {
  if (Math.abs(target - 745) > 0.001) {
    throw new Error(`late joiner target wrong: ${target}`)
  }
  console.log('late joiner OK (lands at 745.0s)')
}
