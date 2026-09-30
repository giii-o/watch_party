// useRoomPresence: answers "who is in the room right now?" — live.
//
// Playback does NOT travel through this channel anymore. The room row
// in the database is the single playback truth (see usePlaybackSync);
// this hook is purely presence.
import { useEffect, useState } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient.js'

const useRoomPresence = (roomCode, userId, { isHost = false } = {}) => {
  const [participants, setParticipants] = useState([])
  const [isConnected, setIsConnected] = useState(false)

  useEffect(() => {
    if (!isSupabaseConfigured || roomCode === null || roomCode === undefined) {
      return undefined
    }

    const channel = supabase.channel(`room:${roomCode}`)

    channel
      .on('presence', { event: 'sync' }, () => {
        const currentState = channel.presenceState()
        const everyone = Object.values(currentState)
          .flat()
          .sort((a, b) => String(a.joined_at).localeCompare(String(b.joined_at)))
        setParticipants(everyone)
      })
      .subscribe(async (status) => {
        if (status !== 'SUBSCRIBED') {
          return
        }
        setIsConnected(true)
        await channel.track({
          user_id: userId,
          // The host is just a client with the name "host". userId can
          // still be undefined while the session is loading — never call
          // .slice() on it in that state.
          display_name:
            isHost || userId === null || userId === undefined
              ? isHost ? 'host' : 'Guest'
              : userId.slice(0, 8),
          joined_at: new Date().toISOString(),
        })
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [roomCode, userId, isHost])

  return { participants, isConnected }
}

export default useRoomPresence
