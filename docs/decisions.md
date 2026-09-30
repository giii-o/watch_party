# Decisions

## 2026-10-01 — Playback writes degrade gracefully when the speed migration is missing

The pause bug returned after the speed feature: every playback write now includes playback_rate, so on a database without the new column EVERY write failed (PGRST204) — and pause is the one action that MUST change the row (play needs no write; the row already says playing). That produced exactly "pause shows a loading animation and continues to play". Fix in rooms.js: a failed write with PGRST204 retries the SAME intent without the rate field, so play/pause/seek always work and speed sync simply stays off until supabase/schema-current.sql is run (one console.warn, once). Lesson: adding a column to a hot write path turns a missing migration into a full playback outage.

Reason: the user re-reported the pause bug; the schema update had not been applied, and a console.error was too easy to miss.

## 2026-10-01 — A host pause wins immediately (stale-row grace, mirrored locally)

Pausing showed a loading flash and then kept playing: during the write's round-trip the row still said playing, so the host loop's play-retry forced play back on (re-buffering) and the seek detector read the paused player as a jump and re-wrote playing. Fix: the host loop mirrors a genuine PAUSED (state-based, buffering excluded) into its LOCAL anchor for the few ms until the re-anchored row arrives, and hostSeeked now requires the PLAYER to actually be playing. Deliberate seeks are unaffected (a seeking host is playing), and the row remains the shared truth — the mirror only bridges the write's round-trip.

Reason: the user reported pause showing a loading animation and resuming; the loop was fighting the host's own pause against a stale row.

## 2026-10-01 — Every video option travels with the room row (playback speed added)

Position was not enough for late joiners: the room's PLAYBACK SPEED never left the host's browser. The rooms table gains a `playback_rate` column (default 1; run supabase/schema-current.sql to add it), `updatePlaybackState` stamps the host player's current rate into every write, and `buildRoomState` reads it into the anchor (falling back to 1 on older databases). Every client applies it: parked guests adopt the speed while waiting and pre-seek to live (that pre-seek was previously unreachable dead code behind the parked early-return — the join click's seek had been saving it), the join click sets rate + position together, the host adopts the row's speed while unarmed so a refreshed host lands on the party's options, and an armed host stays the live source (its own menu choice is never dragged back by a row it wrote). New tests lock the rate in: row rate becomes the anchor rate, and a late joiner lands on the speed-adjusted timeline (26 passing).

Reason: the user asked that a guest joining mid-video get ALL of the host's video options; speed was the one option the row did not carry.

## 2026-09-30 — Restored: a refreshed host never restarts the room; late joiners pre-seek to live

The sync-agent rewrite dropped the attempt-3 protection, so a refreshed host's autoplay fired PLAYING at ~0:00 and — via the state-event write or the seek detector — restarted the video on every screen ("refresh animation, then it plays from the start for all"). Restored as a two-part guard inside the agent design: (1) shouldWritePlayingIntent rejects a PLAYING event whose position sits in a fresh-load contradiction window (~0–5s) against a far-ahead playing anchor; (2) seek detection only runs on an ARMED host — an unarmed (fresh-load) playing host is aligned onto the live timeline (obey, never write) and arms once it is playing along that timeline, so the detector can never bless a load artifact. Late joiners: parked guests now pre-seek (while paused) to the live position, and the "Join the video" click seeks before its first play — no more starting from the beginning for the first moments. New tests lock the guard in scripts/sync-engine.test.mjs (24 passing).

Reason: the user reported both regressions and asked to fix them without touching the rest of the approved sync design.

## 2026-09-26 — Attempt 3 approved: host rejoin lands on the truth; clients default to paused

Two additions to the standard. (1) A host joining or REFRESHING mid-party now LANDS on the truth's position (hostAlignmentPlan), and a PLAYING event whose position contradicts the truth (a stale ~0:00 after a page load) is never blessed into the row (shouldWritePlayingIntent) — together these stop a refreshed host from restarting everyone's video at 0:00. A deliberate restart still works: pause, drag to 0, play. (2) CLIENT DEFAULT = PAUSED: a guest who has not opted in stays parked (overlay = the opt-in button) instead of auto-playing muted; joining flips them into full follow mode. The row poll backstop dropped from 3s to 2s.

Reason: the user approved with these amendments — the guest should choose to join rather than be dropped into a live stream, and the controller must never poison the truth with a stale position.

## 2026-09-26 — THE SYNC STANDARD (approved baseline for all future attempts)

This is the agreed baseline; future tuning attempts are diffs against it, and `scripts/sync-engine.test.mjs` locks the numbers in. The delay chain, end to end: the host's seek bar fires NO YouTube event, so a 1-second seek DETECTOR compares the host player against where the last write says it should be and writes a real jump immediately — host actions reach the row in ≤1s (was up to 3s). Guests run a 500ms alignment tick (was 1s) and jump when drift exceeds 1.5s. The single "Join the video" overlay appears after ~1.5s (was 2–3s) — for an autoplay-blocked OR a muted-but-playing guest — and is the ONE path to sound: seek to live + play + unmute in one click. The separate "Sound on" chip was removed. Measured worst-case drift in the 30s soak: ~2s (heartbeat 3s).

Reason: the user set the acceptance window (overlay between 1–3s, minimal delay) and ratified this attempt as the standard to build on and revert to.

## 2026-09-26 — Tighter sync: catch-up plan with a provider capability flag

Sync constants tightened: guests realign every second against a 3-second host heartbeat with a 1.5-second jump threshold, so the worst measured drift in a 30-second soak is ~2s (was ~3s). Small gaps are handled by a playbackCatchUpPlan: jump (seek) when the gap is real, hold speed when it is invisible, and — only when a provider supports CONTINUOUS rates — nudge the speed a few percent (1.04x/0.96x) to close a gap without any jump. YouTube's iframe player only plays discrete speeds (0.75/1/1.25…), so it declares no continuous-rate support and holds instead; the nudging idea stays ready for a provider that can do it.

Reason: "slow one player down to match the other" is the classic watch-together trick, but on YouTube a 1.04x nudge would audibly snap to 1.25x. Encoding the capability in the math keeps the trick available without ever applying it where it would break.

## 2026-09-26 — Guests play muted first; sync gets a guaranteed floor

Every browser refuses to autoplay UNMUTED video — so a guest's play command mostly never took effect, which looked like "sync doesn't work at all". Guests now start MUTED (muted autoplay is always allowed), with a "Sound on" button; the "Join the video" overlay remains as the fallback after 2 seconds of refused plays. On top of that, guests run a 1-second ALIGNMENT TICK (play + seek until they match the truth), realtime pushes are backed by a 3-second row poll, and the sync math (staleness, target position, drift, play/pause decisions) lives in a pure module (`src/lib/syncMath.js`) that is exercised by automated tests (`scripts/sync-engine.test.mjs`) covering seeks-while-playing, seeks-while-paused, pause/resume, late joiners, and a 30-second soak.

Reason: sync must not depend on a single realtime push and a lucky autoplay. With a muted start, a 1-second self-correction loop, a 3-second poll floor, and tested decision math, every timeline change reaches every screen without any reload.

## 2026-09-26 — Video code lives in its own provider folder behind a facade

All video-related code — link parsing and the iframe player hook — moved from `src/lib` and `src/hooks` into `src/video/providers/youtube/`. The app imports ONLY from the facade `src/video/index.js`, which hands out provider-neutral pieces (`extractVideoId`, `isValidVideoLink`, `useVideoPlayer`, `PLAYER_STATE`). No page, component, or room logic mentions YouTube by name anymore.

Reason: the app starts with YouTube but will not stay YouTube-only. A second provider later (Vimeo, raw files) means adding a folder and flipping a switch in the facade — not rewriting the UI. (Kept as a deliberate structure, since industry practice varies here.)

## 2026-09-26 — Guests catch up without a reload: polling fallback + autoplay recovery
<arg_value><b88a6f17>
Two fixes for "the client video doesn't play / needs a reload": (1) every screen re-fetches the room row every 10 seconds and applies it if anything differs — realtime stays instant, the poll only rescues a swallowed push; (2) browsers refuse to autoplay videos WITH sound (a browser rule, not a bug), so when a guest's play is refused the screen retries silently for 2 seconds and then shows a one-click "Join the video" button that seeks to the live position and plays.

Reason: a guest staring at a paused screen while the host watches is the worst failure this app can have; both fixes make the client self-heal without anyone pressing F5.

## 2026-09-26 — Leaving is not closing

Guests get a "Leave room" button that simply navigates home — the room stays open. The host's old back-navigation auto-close (popstate) was REMOVED on purpose: a room only closes through the host's "Close room" button now. If a host leaves WITHOUT closing, the room stays open, so the next "Start party" finds it and asks before closing it — the confirmation prompt appears exactly when a room was not closed via the button.

Reason: closing everyone's party as a side effect of one back-press was surprising; making the prompt the explicit detector of "you still have a party running" matches what the user actually wants to know.

## 2026-09-16 — Build the core product first

I will focus on the main features of the app before adding payments, subscriptions, or other advanced features.

Reason: I want to first prove that the app solves its main problem and learn the core development process.

## 2026-09-23 — Use Supabase as the backend stack

For accounts, data storage, and realtime sync I will use Supabase (Auth + Postgres database + Realtime) instead of Firebase or building my own server.

Reason: One free service covers the needs of steps 3–8 of the build plan (login, database, room sync, chat), it is beginner-friendly, and it means I never have to swap services mid-project. Voice chat (step 9) will use a separate service (e.g. LiveKit), and hosting (step 10) will be Vercel or Netlify.

## 2026-09-25 — Email confirmation off during development, custom SMTP before launch

Supabase's "Confirm email" setting stays OFF while building, and gets re-enabled together with a custom SMTP provider before any real launch.

Reason: Supabase's built-in email sender is heavily rate-limited and often lands in spam, which blocked all logins with "Email not confirmed" and made testing painful. The app already supports both modes: signup detects when no confirmation is needed (logs straight in), and login offers a "resend confirmation email" button when it is required. Before launch, confirmation goes back ON with reliable email delivery, so real users can verify their accounts.

## 2026-09-25 — Playlist lives in a table, updates via database pushes

Playlist items are rows in a `playlist_items` table (video link, title, adder, position) with Row Level Security: everyone in a room may read, only logged-in users may add, and only the adder may edit or delete their item. The room page subscribes to INSERT events on that table, so every open browser appends new videos live without a reload. Real video titles are fetched once at add-time via YouTube's keyless oEmbed endpoint and stored in the row.

Reason: Persisting the queue makes it survive reloads and lets late joiners see the full list, and the database — not browser code — is the enforcer of who may add. Real titles make the playlist readable for everyone in the room.

## 2026-09-25 — Interim: the middle-ground box carried the controller (REVERTED)

(Temporarily superseded the "host writes its intent" part of the middle-ground decision; reverted the same day.) The controller briefly lived in the middle-ground box (bottom-right on the host page): it was the only player with YouTube's control bar, and its play/pause/end events wrote the intent into the room row. The host's main frame and every guest screen were pure displays. The box, its hook, and its styles were removed once the main-frame controls were proven.

Reason: separating "the one screen that decides" from "the screens that display" made the sync behavior obvious while debugging: if any screen was wrong, the truth in the row was the suspect, not a second writer.

## 2026-09-25 — Playback sync: the database row is the single middle ground

(Supersedes the same-day "broadcast for the how" decision.) The room row itself is the shared playback truth: `active_video_id`, `is_playing`, `position_seconds` + `state_updated_at` (a timestamp, so every screen can fast-forward the position to "now" without comparing device clocks). There are no playback broadcasts at all anymore. Host and guests run ONE identical client: it loads whatever video the row names, plays or pauses when the row says so, and corrects its position only when it has drifted more than ~2 seconds. The host is just a client with the name "host" — its only difference is that the database ACCEPTS its writes (row level security refuses guests'), so it writes every play/pause moment plus a 5-second heartbeat while playing. The separate hidden host player was removed; the host watches the same main frame as everyone else.

Reason: three different player setups (a corner "dormant player", the guest frame, the broadcast pipe) were hard to reason about and each could fail alone. One truth in the database and one client path means the behavior of every screen is defined in one place, late joiners automatically land mid-video from the row, and a guest who goes silent only ever pauses itself.