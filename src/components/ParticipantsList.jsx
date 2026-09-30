// ParticipantsList: shows everyone currently in the room, live.
// Props:
// - participants: array from useRoomPresence: [{ user_id, display_name, joined_at }]
// - currentUserId: the logged-in user's id (null when logged out)
// - hostId: the room creator's id from the database
// - isConnected: true once we are connected to the realtime channel
const ParticipantsList = ({ participants, currentUserId, hostId, isConnected }) => {
  return (
    <section className="participants">
      <h2 className="panel-title">
        In the room{' '}
        <span className="participants__status">
          {isConnected ? '· live' : '· connecting...'}
        </span>
      </h2>
      {participants.length === 0 ? (
        <p className="participants__empty">Just you so far.</p>
      ) : (
        <ul className="participants__list">
          {participants.map((participant) => {
            const isHost = participant.user_id === hostId
            const isMe = participant.user_id !== null && participant.user_id === currentUserId
            return (
              <li key={participant.user_id ?? participant.joined_at} className="participants__item">
                <span className="participants__name">
                  {isMe ? `${participant.display_name} (you)` : participant.display_name}
                </span>
                {isHost && <span className="participants__badge">host</span>}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

export default ParticipantsList
