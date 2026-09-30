import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

// JoinRoomForm: lets the user type a room code and go to that room.
// Navigation already works for real — room validation comes in step 5.
const JoinRoomForm = () => {
  const [roomCode, setRoomCode] = useState('')
  const navigate = useNavigate()

  const handleRoomCodeChange = (event) => {
    // Store the code in uppercase and trim spaces, so " abc123 " becomes "ABC123"
    setRoomCode(event.target.value.trim().toUpperCase())
  }

  const handleJoinSubmit = (event) => {
    event.preventDefault() // stop the browser from reloading the page
    if (roomCode !== '') {
      navigate(`/room/${roomCode}`)
    }
  }

  return (
    <section className="card">
      <p className="eyebrow">Join</p>
      <h2 className="card__title">Join a watch party</h2>
      <p className="card__text">Got a code from a friend? Enter it here.</p>
      <form className="join-form" onSubmit={handleJoinSubmit}>
        <input
          className="input"
          type="text"
          placeholder="Room code, e.g. ABC123"
          value={roomCode}
          onChange={handleRoomCodeChange}
          aria-label="Room code"
        />
        <button className="button button--primary" type="submit" disabled={roomCode === ''}>
          Join
        </button>
      </form>
    </section>
  )
}

export default JoinRoomForm
