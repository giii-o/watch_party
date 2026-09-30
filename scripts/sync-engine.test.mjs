// Tests for the SYNC AGENT (src/lib/syncAgent.js) — the sole sync
// logic of Watch Party. The agent's pure decision functions are
// driven directly, with a fake clock for the scenarios. Node's
// built-in test runner, no dependencies.
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildRoomState,
  expectedVideoTime,
  evaluate,
  hostSeeked,
  isReportableIntent,
  HARD_SYNC_THRESHOLD_SECONDS,
  SYNC_INTERVAL_MS,
  SYNC_KP,
  MIN_NUDGE_RATE,
  MAX_NUDGE_RATE,
  shouldWritePlayingIntent,
} from '../src/lib/syncAgent.js'
import { PLAYER_STATE } from '../src/video/index.js'

// ---------- helpers ----------

const roomStateAt = (isPlaying, anchorVideoTime, anchorReceivedAtMs) => ({
  isPlaying,
  anchorVideoTime,
  anchorReceivedAtMs,
  playbackRate: 1.0,
})

const evalArgs = (rs, nowMs, playerTimeSeconds, playerIsPlaying, supportsContinuousRate = false) => ({
  roomState: rs,
  nowMs,
  playerTimeSeconds,
  playerIsPlaying,
  supportsContinuousRate,
})

// ------------------------------------------------------------
// Anchor math
// ------------------------------------------------------------

test('expected time: paused row holds position regardless of elapsed time', () => {
  const rs = roomStateAt(false, 42, 1000)
  assert.equal(expectedVideoTime(rs, 1000), 42)
  assert.equal(expectedVideoTime(rs, 91000), 42) // 90s later
})

test('expected time: playing row fast-forwards with elapsed time', () => {
  const rs = roomStateAt(true, 100, 1000)
  assert.equal(expectedVideoTime(rs, 6000), 105) // 5s elapsed
})

test('expected time: negative elapsed clamps to zero', () => {
  const rs = roomStateAt(true, 100, 5000)
  assert.equal(expectedVideoTime(rs, 4000), 100) // "before" the anchor
})

test('buildRoomState normalizes a row into the anchor', () => {
  const rs = buildRoomState(
    { is_playing: true, position_seconds: 33.5 },
    7777,
  )
  assert.deepEqual(rs, {
    isPlaying: true,
    anchorVideoTime: 33.5,
    anchorReceivedAtMs: 7777,
    playbackRate: 1.0,
  })
  // A missing position must never poison the math (NaN spread).
  const rsBare = buildRoomState({ is_playing: false }, 1)
  assert.equal(rsBare.anchorVideoTime, 0)
  // Non-true is_playing is paused.
  assert.equal(buildRoomState({ is_playing: 1 }, 1).isPlaying, false)
})

test('buildRoomState: the row playback rate becomes the anchor rate', () => {
  const rs = buildRoomState(
    { is_playing: true, position_seconds: 10, playback_rate: 1.5 },
    0,
  )
  assert.equal(rs.playbackRate, 1.5)
  // A missing column (older database) or junk falls back to normal
  // speed — never 0 or NaN, which would freeze the anchor math.
  assert.equal(buildRoomState({ is_playing: true }, 0).playbackRate, 1.0)
  assert.equal(buildRoomState({ is_playing: true, playback_rate: 0 }, 0).playbackRate, 1.0)
})

// ------------------------------------------------------------
// The evaluate decision — YouTube path (no continuous rates)
// ------------------------------------------------------------

test('evaluate: none while the truth is paused (no correction)', () => {
  const rs = roomStateAt(false, 50, 0)
  const plan = evaluate(evalArgs(rs, 10000, 10, true))
  assert.equal(plan.action, 'none')
  assert.equal(plan.targetTime, 50)
})

test('evaluate: none while this player is paused (obey side handles it)', () => {
  const rs = roomStateAt(true, 50, 0)
  const plan = evaluate(evalArgs(rs, 10000, 10, false))
  assert.equal(plan.action, 'none')
})

test('evaluate: hard seek when far BEHIND the anchor', () => {
  const rs = roomStateAt(true, 0, 0)
  const plan = evaluate(evalArgs(rs, 10000, 4, true)) // target 10, at 4
  assert.equal(plan.action, 'seek')
  assert.equal(plan.targetTime, 10)
  assert.equal(plan.rate, 1.0)
})

test('evaluate: hard seek when far AHEAD of the anchor', () => {
  const rs = roomStateAt(true, 0, 0)
  const plan = evaluate(evalArgs(rs, 10000, 16, true)) // target 10, at 16
  assert.equal(plan.action, 'seek')
  assert.equal(plan.targetTime, 10)
})

test('evaluate: HOLD inside the threshold on YouTube (no nudging)', () => {
  const rs = roomStateAt(true, 0, 0)
  const plan = evaluate(evalArgs(rs, 10000, 9.5, true)) // 0.5s behind
  assert.equal(plan.action, 'hold')
  assert.equal(plan.rate, null)
})

test('evaluate: YouTube path NEVER returns a rate nudge', () => {
  const rs = roomStateAt(true, 0, 0)
  for (const at of [9.0, 9.9, 10.2, 11.0]) {
    const plan = evaluate(evalArgs(rs, 10000, at, true, false))
    assert.notEqual(plan.action, 'nudge')
  }
})

test('evaluate: exactly at the threshold is still a hold (strictly greater)', () => {
  const rs = roomStateAt(true, 0, 0)
  const plan = evaluate(evalArgs(rs, 10000, 10 - HARD_SYNC_THRESHOLD_SECONDS, true))
  assert.equal(plan.action, 'hold')
})

// ------------------------------------------------------------
// Soft sync — only for providers with continuous rates
// ------------------------------------------------------------

test('soft sync: behind player is nudged FASTER by delta * kp', () => {
  const rs = roomStateAt(true, 0, 0)
  const plan = evaluate(evalArgs(rs, 10000, 9.2, true, true)) // 0.8 behind
  assert.equal(plan.action, 'nudge')
  assert.ok(Math.abs(plan.rate - (1 + 0.8 * SYNC_KP)) < 1e-9)
  assert.ok(plan.rate > 1)
})

test('soft sync: the nudge clamps at the upper bound', () => {
  const rs = roomStateAt(true, 0, 0)
  const plan = evaluate(evalArgs(rs, 10000, 10 - 1.2, true, true)) // 1.2 behind
  assert.equal(plan.action, 'nudge')
  assert.equal(plan.rate, MAX_NUDGE_RATE)
})

test('soft sync: ahead player is nudged SLOWER, bounded below', () => {
  const rs = roomStateAt(true, 0, 0)
  const small = evaluate(evalArgs(rs, 10000, 10.5, true, true)) // 0.5 ahead
  assert.equal(small.action, 'nudge')
  assert.ok(Math.abs(small.rate - (1 - 0.5 * SYNC_KP)) < 1e-9)
  const big = evaluate(evalArgs(rs, 10000, 10 + 5, true, true))
  assert.equal(big.action, 'seek') // beyond threshold: hard, not nudge
  assert.ok(MIN_NUDGE_RATE < 1 && MAX_NUDGE_RATE > 1)
})

// ------------------------------------------------------------
// Host seek detection
// ------------------------------------------------------------

test('host seek: paused host never reports a seek', () => {
  const rs = roomStateAt(false, 10, 0)
  assert.equal(hostSeeked(evalArgs(rs, 60000, 90, true)), false)
})

test('host seek: a host playing along its timeline is NOT a seek', () => {
  const rs = roomStateAt(true, 10, 0)
  assert.equal(hostSeeked(evalArgs(rs, 5000, 14.8, true)), false) // 0.2 off
})

test('host seek: a playing host past the threshold IS a seek', () => {
  const rs = roomStateAt(true, 10, 0)
  assert.equal(hostSeeked(evalArgs(rs, 5000, 30, true)), true)
})

test('host seek: a PAUSED host against a stale playing row is NOT a seek', () => {
  // The row still says playing (the pause write is in flight); the
  // host player just paused. That must never read as a jump — writing
  // it would fight the pause and force the video back on.
  const rs = roomStateAt(true, 10, 0)
  assert.equal(hostSeeked(evalArgs(rs, 5000, 30, false)), false)
})

// ------------------------------------------------------------
// Intent filtering
// ------------------------------------------------------------

test('intents: PLAYING, PAUSED and ENDED are reportable', () => {
  assert.equal(isReportableIntent(PLAYER_STATE.PLAYING), true)
  assert.equal(isReportableIntent(PLAYER_STATE.PAUSED), true)
  assert.equal(isReportableIntent(PLAYER_STATE.ENDED), true)
})

test('intents: BUFFERING, UNSTARTED and CUED are noise', () => {
  assert.equal(isReportableIntent(PLAYER_STATE.BUFFERING), false)
  assert.equal(isReportableIntent(PLAYER_STATE.UNSTARTED), false)
  assert.equal(isReportableIntent(PLAYER_STATE.CUED), false)
})

// ------------------------------------------------------------
// The refreshed-host guard
// ------------------------------------------------------------

test('guard: a stale 0:00 PLAYING event after a host refresh is rejected', () => {
  // The party has been playing for 30s; the refreshed host's player
  // fires PLAYING at ~0:00.
  const rs = roomStateAt(true, 740, 0)
  assert.equal(shouldWritePlayingIntent({ roomState: rs, nowMs: 30000, playerTimeSeconds: 0 }), false)
  assert.equal(shouldWritePlayingIntent({ roomState: rs, nowMs: 30000, playerTimeSeconds: 2 }), false)
})

test('guard: the host playing along its own timeline is accepted', () => {
  const rs = roomStateAt(true, 100, 0)
  // target = 106 at t=6s; host player at 105.7 -> fine.
  assert.equal(shouldWritePlayingIntent({ roomState: rs, nowMs: 6000, playerTimeSeconds: 105.7 }), true)
  // Far past the fresh-load window -> always accepted.
  assert.equal(shouldWritePlayingIntent({ roomState: rs, nowMs: 6000, playerTimeSeconds: 12 }), true)
  // Resuming a paused room is always accepted.
  const paused = roomStateAt(false, 42, 0)
  assert.equal(shouldWritePlayingIntent({ roomState: paused, nowMs: 30000, playerTimeSeconds: 3 }), true)
  // A host genuinely (re)starting at the live position is accepted.
  assert.equal(shouldWritePlayingIntent({ roomState: rs, nowMs: 6000, playerTimeSeconds: 106 }), true)
})

// ------------------------------------------------------------
// Scenarios (fake clock)
// ------------------------------------------------------------

// A behind guest catches up in ONE hard seek and then holds.
test('scenario: lagging guest converges with a single seek then holds', () => {
  const rs = roomStateAt(true, 100, 0)
  let playerTime = 100 // target is 103 at t=3s: 3s behind
  const dt = SYNC_INTERVAL_MS / 1000
  let seeks = 0
  for (let now = 3000; now <= 6000; now += SYNC_INTERVAL_MS) {
    const plan = evaluate(evalArgs(rs, now, playerTime, true))
    if (plan.action === 'seek') {
      seeks += 1
      playerTime = plan.targetTime
    } else if (plan.action === 'nudge') {
      playerTime += dt * plan.rate
    } else {
      playerTime += dt
    }
  }
  assert.equal(seeks, 1)
  assert.ok(Math.abs(playerTime - 106) < 0.3)
})

// The host drags the bar: within ~1.25s every guest has landed there.
test('scenario: host seek propagates — guest lands on the new spot', () => {
  // 1. The host seeked: its player is far from its own anchor.
  const hostRs = roomStateAt(true, 200, 0)
  const nowAfterSeek = 4000
  assert.equal(hostSeeked(evalArgs(hostRs, nowAfterSeek, 500, true)), true)
  // 2. The new row re-anchors every screen at 500.
  const guestRs = buildRoomState(
    { is_playing: true, position_seconds: 500 },
    nowAfterSeek,
  )
  const guestTime = expectedVideoTime(guestRs, nowAfterSeek + 1250)
  const plan = evaluate(evalArgs(guestRs, nowAfterSeek + 1250, 201, true))
  assert.equal(plan.action, 'seek')
  assert.ok(Math.abs(plan.targetTime - guestTime) < 0.001)
})

// A guest joining mid-party lands on the LIVE position, not 0:00.
test('scenario: late joiner lands mid-video', () => {
  const rs = buildRoomState(
    { is_playing: true, position_seconds: 740 },
    0,
  )
  const target = expectedVideoTime(rs, 5000) // joined 5s after the row
  assert.ok(Math.abs(target - 745) < 0.001)
  const plan = evaluate(evalArgs(rs, 5000, 0, true)) // player still at 0
  assert.equal(plan.action, 'seek')
  assert.equal(plan.targetTime, target)
})

// A late joiner at a non-1x room speed lands mid-video on the SPEED-
// adjusted timeline (4 wall-clock seconds = 6 video seconds at 1.5x).
test('scenario: late joiner lands mid-video at the room speed', () => {
  const rs = buildRoomState(
    { is_playing: true, position_seconds: 100, playback_rate: 1.5 },
    0,
  )
  const target = expectedVideoTime(rs, 4000)
  assert.ok(Math.abs(target - 106) < 0.001)
  const plan = evaluate(evalArgs(rs, 4000, 0, true))
  assert.equal(plan.action, 'seek')
  assert.equal(plan.targetTime, target)
})
