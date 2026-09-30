import { supabase } from './supabaseClient.js'

// Small helpers for the "rooms" table in Supabase.
// Current schema: id, room_code, name, host_id, active_video_id,
// created_at, closed_at (NULL = the party is live).
// The database does the real checks:
// - INSERT/UPDATE only for logged-in users / the host (Row Level Security)

const ROOM_CODE_CHARACTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

// Generates a 6-character code like "K7Q2XD".
// (No I, O, 0, 1 — they look too similar and cause typos when shared.)
const generateRoomCode = () => {
  let code = ''
  for (let i = 0; i < 6; i += 1) {
    code += ROOM_CODE_CHARACTERS[Math.floor(Math.random() * ROOM_CODE_CHARACTERS.length)]
  }
  return code
}

// Saves a new room. The user must be logged in — the database enforces it.
// We send host_id EXPLICITLY; the security rule only accepts a row whose
// host_id equals the logged-in user's id, so sending it is safe.
const createRoom = (roomCode, hostId) => {
  return supabase
    .from('rooms')
    .insert({ room_code: roomCode, host_id: hostId })
    .select()
    .single()
}

// Looks up a room by its code. data is null when the code does not exist.
const getRoomByCode = (roomCode) => {
  return supabase.from('rooms').select('*').eq('room_code', roomCode).maybeSingle()
}

// The host's most recent OPEN room (closed_at is null), or null.
// Used so an admin only runs one live party at a time.
const getOpenRoomForHost = (hostId) => {
  return supabase
    .from('rooms')
    .select('id, room_code')
    .eq('host_id', hostId)
    .is('closed_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
}

// The host picks which video plays: writes the middle ground. The
// database refuses this update for anyone who is not the host (row
// level security). Starting a video also resets position and marks it playing.
const updateActiveVideo = (roomId, videoId) => {
  return supabase
    .from('rooms')
    .update({
      active_video_id: videoId,
      is_playing: true,
      position_seconds: 0,
      state_updated_at: new Date().toISOString(),
    })
    .eq('id', roomId)
}

// A playback intent: "the room should be playing X at position Y".
// Structurally identical for EVERY client — the host's writes are
// accepted, guests' writes are refused by row level security.
let missingRateColumnWarned = false
const updatePlaybackState = (roomId, { isPlaying, positionSeconds, playbackRate }) => {
  // The speed is part of the shared truth: every write carries it, so a
  // guest joining (or re-syncing) lands on the same speed as the host.
  // A missing rate (older callers) falls back to 1 — a rate below 0.25
  // is never a real YouTube speed.
  const baseFields = {
    is_playing: isPlaying,
    position_seconds: positionSeconds,
    state_updated_at: new Date().toISOString(),
  }
  const rateIsValid = typeof playbackRate === 'number' && playbackRate >= 0.25
  const fieldsWithRate = rateIsValid
    ? { ...baseFields, playback_rate: playbackRate }
    : baseFields

  const request = supabase.from('rooms').update(fieldsWithRate).eq('id', roomId)

  // A failed write would silently desync EVERY screen — never let it
  // vanish. The one recoverable case: PGRST204 ("could not find column")
  // means the playback_rate migration has not been run. Retrying the
  // SAME intent without the rate keeps play/pause/seek WORKING (speed
  // sync simply waits for the migration) instead of breaking pause.
  request.then(({ error }) => {
    if (!error) {
      return
    }
    if (error.code === 'PGRST204' && rateIsValid) {
      if (!missingRateColumnWarned) {
        missingRateColumnWarned = true
        console.warn(
          '[watch-party] the playback_rate column is missing — speed sync is OFF until you run supabase/schema-current.sql in the Supabase SQL Editor. Play/pause still work.',
        )
      }
      supabase
        .from('rooms')
        .update(baseFields)
        .eq('id', roomId)
        .then(({ error: retryError }) => {
          if (retryError) {
            console.error('[watch-party] playback write failed —', retryError.message)
          }
        })
      return
    }
    console.error('[watch-party] playback write failed —', error.message)
  })
  return request
}

// A plain one-shot fetch of the room row by id. Used as a fallback when
// a realtime push may have been missed (for example right after a guest
// joins, or when a connection hiccup swallows an update).
const getRoomById = (roomId) => {
  return supabase.from('rooms').select('*').eq('id', roomId).maybeSingle()
}

// Subscribes to UPDATES of the room row itself. This is how guests learn
// live that the host changed the video or closed the room.
// Returns the channel so the room page can stop listening later.
const subscribeToRoomUpdates = (roomId, onUpdate) => {
  return supabase
    .channel(`room-row:${roomId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'rooms',
        filter: `id=eq.${roomId}`,
      },
      (payload) => onUpdate(payload.new),
    )
    .subscribe()
}

// The host closes the room. Guests receive the row update live and are
// sent back to the home page. Only the host may do this.
const closeRoom = (roomId) => {
  return supabase
    .from('rooms')
    .update({ closed_at: new Date().toISOString() })
    .eq('id', roomId)
}

export {
  generateRoomCode,
  createRoom,
  getRoomByCode,
  getRoomById,
  getOpenRoomForHost,
  updateActiveVideo,
  updatePlaybackState,
  subscribeToRoomUpdates,
  closeRoom,
}
