import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import StartPartyCard from '../components/StartPartyCard.jsx'
import JoinRoomForm from '../components/JoinRoomForm.jsx'
import UserMenu from '../components/UserMenu.jsx'
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient.js'
import {
  closeRoom,
  createRoom,
  generateRoomCode,
  getOpenRoomForHost,
} from '../lib/rooms.js'

// Home page: start a new watch party or join one with a code.
//
// One live party per admin: before creating a room we look for an old
// room that is still open. If one exists the user is warned that it
// will be closed, and only continues after confirming.
//
// A host who goes home while their party is still live sees the Join
// block swap to "your party is running": their code pre-filled, a Join
// button, and a Close room button (same effects as the in-room one).
const HomePage = () => {
  const navigate = useNavigate()
  const [isCreating, setIsCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  // The host's still-open room, if any: { id, room_code } or null.
  const [openRoom, setOpenRoom] = useState(null)
  const [isClosingRoom, setIsClosingRoom] = useState(false)

  // Look up the host's open room once on page load (and only when
  // logged in — guests and logged-out visitors just see the plain form).
  useEffect(() => {
    if (!isSupabaseConfigured) {
      return undefined
    }
    let isActive = true

    supabase.auth.getSession().then(({ data }) => {
      const user = data.session?.user ?? null
      if (!isActive || user === null) {
        return
      }
      getOpenRoomForHost(user.id).then(({ data: room }) => {
        if (isActive) {
          setOpenRoom(room ?? null)
        }
      })
    })

    return () => {
      isActive = false
    }
  }, [])

  // "Join" on the host's own live room: same as typing the code.
  const handleJoinOpenRoom = (event) => {
    event.preventDefault()
    navigate(`/room/${openRoom.room_code}`)
  }

  // The home-page "Close room": identical effects to the in-room close
  // (same database call — stamps closed_at, and every guest is sent
  // home), but the host stays on the home page and the block reverts.
  const handleCloseOpenRoom = async () => {
    if (openRoom === null || isClosingRoom) {
      return
    }

    const isConfirmed = window.confirm(
      'Close this room for everyone? Guests will be sent back to the home page.',
    )
    if (!isConfirmed) {
      return
    }

    setIsClosingRoom(true)
    try {
      const { error } = await closeRoom(openRoom.id)
      if (error) {
        throw error
      }
      setOpenRoom(null) // back to the plain join/start cards
    } catch (closeError) {
      setCreateError(closeError.message)
    } finally {
      setIsClosingRoom(false)
    }
  }

  const handleStartParty = async () => {
    setCreateError('')

    if (!isSupabaseConfigured) {
      setCreateError(
        'Supabase is not set up yet — add your keys to .env (see src/lib/supabaseClient.js).',
      )
      return
    }

    setIsCreating(true)
    try {
      // 1. Am I actually logged in? Ask the session, don't guess.
      const { data } = await supabase.auth.getSession()
      const user = data.session?.user ?? null

      if (user === null) {
        setCreateError('Please log in before starting a party.')
        return
      }

      // 2. One live party per admin: an old open room must be closed first.
      const { data: existingRoom, error: openError } = await getOpenRoomForHost(user.id)
      if (openError) {
        throw openError
      }
      if (existingRoom !== null) {
        const isConfirmed = window.confirm(
          `You still have a party running (room ${existingRoom.room_code}). ` +
            'It will be closed before a new one starts. Continue?',
        )
        if (!isConfirmed) {
          return // keep the old room open, do nothing
        }
        const { error: closeError } = await closeRoom(existingRoom.id)
        if (closeError) {
          throw closeError
        }
      }

      // 3. Create the new room. We pass the user id explicitly; the
      //    database still verifies it matches (row level security).
      const roomCode = generateRoomCode()
      const { error } = await createRoom(roomCode, user.id)
      if (error) {
        throw error
      }

      // The new room is now this host's open room — remember it so a
      // later trip back home shows the "your party is running" block.
      setOpenRoom({ id: null, room_code: roomCode })
      navigate(`/room/${roomCode}`)
    } catch (startError) {
      setCreateError(startError.message)
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <main className="home">
      <header className="home__hero">
        <p className="eyebrow">Watch Party</p>
        <h1>Together, apart.</h1>
        <p>Watch videos together, even miles apart.</p>
      </header>

      <UserMenu />

      {createError !== '' && (
        <p className="home__error" role="alert">
          {createError}
        </p>
      )}

      <div className="home__cards">
        <StartPartyCard onStart={handleStartParty} isDisabled={isCreating} />
        {openRoom !== null ? (
          <section className="card">
            <p className="eyebrow eyebrow--live">Live</p>
            <h2 className="card__title">Your party is running</h2>
            <p className="card__text">Your party is still open.</p>
            <div className="join-form">
              <span className="join-form__code">{openRoom.room_code}</span>
              <button className="button button--primary" type="button" onClick={handleJoinOpenRoom}>
                Join
              </button>
            </div>
            <button
              type="button"
              className="button button--danger join-form__close"
              onClick={handleCloseOpenRoom}
              disabled={isClosingRoom}
            >
              {isClosingRoom ? 'Closing...' : 'Close room'}
            </button>
          </section>
        ) : (
          <JoinRoomForm />
        )}
      </div>

      <p className="home__legal">Watch together. Your email is only used for login.</p>
    </main>
  )
}

export default HomePage
