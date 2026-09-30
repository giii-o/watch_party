import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import RoomLayout from '../components/RoomLayout.jsx'
import usePlaybackSync from '../hooks/usePlaybackSync.js'
import useRoomPresence from '../hooks/useRoomPresence.js'
import { extractVideoId, useVideoPlayer } from '../video/index.js'
import {
  closeRoom,
  getRoomByCode,
  getRoomById,
  subscribeToRoomUpdates,
  updateActiveVideo,
} from '../lib/rooms.js'
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient.js'

const CLOSED_REDIRECT_SECONDS = 5
// Guaranteed catch-up: re-fetch the room row this often and apply it if
// anything differs. Realtime is instant; this poll is the floor that
// makes missed pushes invisible (a seek lands within ~2s even if the
// push was swallowed).
const ROOM_POLL_MS = 2000
// ADMIN GRACE WINDOW: after the HOST changes any playback state, the
// host's own row poll holds off for ~2s (one poll cycle). A poll response
// that was IN FLIGHT during the write could otherwise come back stale and
// briefly drag the host backward (double-correction). Guests keep polling
// normally — the grace is host-only, and realtime pushes still update the
// host instantly, so nothing feels slower.
const ADMIN_GRACE_MS = 2000

const RoomPage = () => {
  const { roomCode } = useParams()
  const navigate = useNavigate()
  const [room, setRoom] = useState(null)
  const [status, setStatus] = useState('loading')
  const [userId, setUserId] = useState(undefined)
  const [isSettingVideo, setIsSettingVideo] = useState(false)
  const [videoError, setVideoError] = useState('')
 // Until this timestamp, the HOST's poll holds off (admin grace window).
  const adminGraceUntilRef = useRef(0)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user?.id ?? null)
    })
  }, [])

  useEffect(() => {
    const loadRoom = async () => {
      if (!isSupabaseConfigured) {
        setStatus('error')
        return
      }

      const { data, error } = await getRoomByCode(roomCode)

      if (error) {
        setStatus('error')
        return
      }
      if (data === null) {
        setStatus('notFound')
        return
      }
      setRoom(data)
      setStatus('found')
    }

    loadRoom()
  }, [roomCode])

  useEffect(() => {
    if (status !== 'found') {
      return undefined
    }

    const channel = subscribeToRoomUpdates(room.id, (updatedRoom) => {
      setRoom(updatedRoom)
    })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [status, room?.id])

  // Polling fallback: guests must never need a reload to learn about a
  // new video or a changed play state. The row fetch compares the fields
  // the app acts on — an identical payload does NOT re-render anything.
  useEffect(() => {
    if (status !== 'found' || room?.id === undefined) {
      return undefined
    }

    const interval = setInterval(async () => {
      // Admin grace: the host just changed the state itself — skip this
      // poll cycle so an in-flight response cannot drag it backward.
      // (Guests poll normally; only the host holds off.)
      if (isHost && Date.now() < adminGraceUntilRef.current) {
        return
      }
      const { data } = await getRoomById(room.id)
      if (data === null) {
        return
      }
      setRoom((currentRoom) => {
        if (currentRoom === null) {
          return data
        }
        // Ignore a STALE response: if the fetch was sent before the
        // latest write, its playback fields are older than what we
        // already applied. A close stamp is always allowed through.
        const closeChanged = (data.closed_at ?? null) !== (currentRoom.closed_at ?? null)
        const stamp = data.state_updated_at ?? ''
        const currentStamp = currentRoom.state_updated_at ?? ''
        if (!closeChanged && stamp !== '' && currentStamp !== '' && stamp < currentStamp) {
          return currentRoom
        }
        const fieldsAreIdentical =
          currentRoom.active_video_id === data.active_video_id &&
          currentRoom.is_playing === data.is_playing &&
          currentRoom.position_seconds === data.position_seconds &&
          currentRoom.state_updated_at === data.state_updated_at &&
          currentRoom.closed_at === data.closed_at
        return fieldsAreIdentical ? currentRoom : data
      })
    }, ROOM_POLL_MS)

    return () => clearInterval(interval)
  }, [status, room?.id, isHost])

  const activeVideoId = useMemo(() => room?.active_video_id ?? null, [room?.active_video_id])

  const isHost = userId !== null && room !== null && userId === room.host_id

  // ONE client path for every screen — host and guests run exactly this.
  // The main player is the CONTROLLER on the host side (its control bar
  // is on) and a display on guest screens. The player state callback goes
  // through a ref so the sync hook (created after the player) can be the
  // real handler without a circular setup.
  const playerStateHandlerRef = useRef(null)
  const { mountRef, controls, playerError, isReady } = useVideoPlayer(
    activeVideoId,
    (playerState) => playerStateHandlerRef.current?.(playerState),
    isHost,
  )

  // Every screen obeys the room row (the central video state). The host's
  // player is the controller: its play/pause/end events write the intent
  // into the row; the host side also keeps the heartbeat and the
  // hidden-tab safety net. On guest screens the hook also detects a
  // browser autoplay refusal and offers the one-click "Join the video".
  const { handlePlayerStateChange, needsJoinOverlay, isJoining, joinPlayback } = usePlaybackSync({
    roomId: room?.id ?? null,
    room,
    isHost,
    controls,
    isPlayerReady: isReady,
    onPlaybackWrite: () => {
      adminGraceUntilRef.current = Date.now() + ADMIN_GRACE_MS
    },
  })

  useEffect(() => {
    playerStateHandlerRef.current = handlePlayerStateChange
  }, [handlePlayerStateChange])

  const { participants, isConnected } = useRoomPresence(
    status === 'found' ? room.room_code : null,
    userId,
    { isHost },
  )

  const roomClosedByHost = room?.closed_at !== null && room?.closed_at !== undefined

  useEffect(() => {
    if (!roomClosedByHost || isHost) {
      return undefined
    }

    const redirectTimer = setTimeout(() => {
      navigate('/app')
    }, CLOSED_REDIRECT_SECONDS * 1000)

    return () => clearTimeout(redirectTimer)
  }, [roomClosedByHost, isHost, navigate])

  const handleCloseRoom = async () => {
    const isConfirmed = window.confirm(
      'Close this room for everyone? Guests will be sent back to the home page.',
    )

    if (!isConfirmed) {
      return
    }

    const { error } = await closeRoom(room.id)
    if (error) {
      setVideoError(error.message)
      return
    }

    navigate('/app')
  }

  // Guests leave on their own: just go home. The room stays open for
  // everyone else — leaving is NOT closing.
  const handleLeaveRoom = () => {
    navigate('/app')
  }

  const handleSetVideo = async (link) => {
    const videoId = extractVideoId(link)
    if (videoId === null) {
      setVideoError('That does not look like a YouTube link.')
      return
    }

    setIsSettingVideo(true)
    setVideoError('')

    try {
      const { error } = await updateActiveVideo(room.id, videoId)
      if (error) {
        throw error
      }
      // A video swap is a state change too — open the grace window.
      adminGraceUntilRef.current = Date.now() + ADMIN_GRACE_MS
      // Optimistic: show the new video instantly. We deliberately do NOT
      // stamp state_updated_at here — the database writes its own clock's
      // timestamp, and a local one could look newer and make the next
      // real row update look STALE by comparison. The real row (with the
      // server stamp) arrives right behind this via realtime.
      setRoom((currentRoom) => ({
        ...currentRoom,
        active_video_id: videoId,
        is_playing: true,
        position_seconds: 0,
      }))
    } catch (setError) {
      setVideoError(setError.message)
    } finally {
      setIsSettingVideo(false)
    }
  }

  if (status === 'loading') {
    return (
      <main className="room-status">
        <p>Checking the room code...</p>
      </main>
    )
  }

  if (status === 'notFound') {
    return (
      <main className="room-status">
        <h1>Room not found</h1>
        <p>No watch party with the code &quot;{roomCode}&quot; exists.</p>
        <Link to="/app">Back to the home page</Link>
      </main>
    )
  }

  if (status === 'error') {
    return (
      <main className="room-status">
        <h1>Something went wrong</h1>
        <p>Could not load the room. Is Supabase set up? (See src/lib/supabaseClient.js)</p>
        <Link to="/app">Back to the home page</Link>
      </main>
    )
  }

  return (
    <RoomLayout
      roomName={room.name}
      roomCode={room.room_code}
      mountRef={mountRef}
      videoId={activeVideoId}
      playerError={playerError}
      isHost={isHost}
      hostId={room.host_id}
      currentUserId={userId}
      participants={participants}
      isConnected={isConnected}
      canSetVideo={isHost}
      onSetVideo={handleSetVideo}
      isSettingVideo={isSettingVideo}
      videoError={videoError}
      onCloseRoom={handleCloseRoom}
      onLeaveRoom={handleLeaveRoom}
      roomClosedByHost={roomClosedByHost}
      needsJoinOverlay={needsJoinOverlay}
      onJoinPlayback={joinPlayback}
      isJoining={isJoining}
      showVideoPlayer
    />
  )
}

export default RoomPage
