import VideoPlayer from './VideoPlayer.jsx'
import ParticipantsList from './ParticipantsList.jsx'
import VideoLinkForm from './VideoLinkForm.jsx'
import CopyCodeButton from './CopyCodeButton.jsx'

// RoomLayout: arranges the room screen — video (left) and participants
// (right). The playlist and chat panels were removed; the room is now
// focused on watching together.
// Also hosts the room lifecycle pieces:
// - the host's "Close room" button (visible only to the host)
// - the "admin has closed this room" overlay every guest sees
// Props:
// - roomName / roomCode: header text
// - mountRef: where the YouTube player mounts
// - videoId: active video (null = placeholder)
// - isHost: host flag (real, from the session + database)
// - hostId / currentUserId: for the host badge in the participant list
// - participants / isConnected: live presence
// - canSetVideo / onSetVideo / isSettingVideo / videoError: host link input
// - onCloseRoom: host button handler
// - onLeaveRoom: guest button handler (leaving is NOT closing)
// - needsJoinOverlay / onJoinPlayback: the guest's one-click "Join the
//   video" (seek to live, play, and unmute — the single sound path)
// - isJoining: true during the join settle window (loading overlay)
// - roomClosedByHost: true once the room row carries a closed_at stamp
const RoomLayout = ({
  roomName,
  roomCode,
  mountRef,
  videoId = null,
  playerError = null,
  isHost = false,
  hostId = null,
  currentUserId = null,
  participants = [],
  isConnected = false,
  canSetVideo = false,
  onSetVideo,
  isSettingVideo = false,
  videoError = '',
  onCloseRoom,
  onLeaveRoom,
  roomClosedByHost = false,
  needsJoinOverlay = false,
  onJoinPlayback,
  isJoining = false,
  showVideoPlayer = true,
}) => {
  return (
    <div className="room">
      {/* Guests: full-screen notice + auto-redirect handled by the room page */}
      {roomClosedByHost && (
        <div className="room__closed-overlay" role="alert" aria-live="assertive">
          <h1>Admin has closed this room</h1>
          <p>Heading back to the home page...</p>
        </div>
      )}

      <header className="room__header">
        <div>
          <h1 className="room__name">{roomName}</h1>
          <div className="room__code-row">
            <p className="room__code">
              Share this code so friends can join: <strong>{roomCode}</strong>
            </p>
            <CopyCodeButton roomCode={roomCode} />
          </div>
        </div>
        <div className="room__header-actions">
          {isHost ? (
            <button
              type="button"
              className="button button--danger"
              onClick={onCloseRoom}
            >
              Close room
            </button>
          ) : (
            <button
              type="button"
              className="button"
              onClick={onLeaveRoom}
            >
              Leave room
            </button>
          )}
        </div>
      </header>

      <div className="room__participants">
        <ParticipantsList
          participants={participants}
          currentUserId={currentUserId}
          hostId={hostId}
          isConnected={isConnected}
        />
      </div>

      <div className="room__grid room__grid--two">
        <div className="room__video-area">
          {showVideoPlayer && (
            <VideoPlayer
              mountRef={mountRef}
              videoId={videoId}
              playerError={playerError}
              isHost={isHost}
              needsJoinOverlay={needsJoinOverlay}
              onJoinPlayback={onJoinPlayback}
              isJoining={isJoining}
            />
          )}
          {isHost && (
            <VideoLinkForm
              onSetVideo={onSetVideo}
              isBusy={isSettingVideo}
              error={videoError}
            />
          )}
        </div>
      </div>
    </div>
  )
}

export default RoomLayout
