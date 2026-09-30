// VideoPlayer: the video area of the room.
//
// The 16:9 frame box is ALWAYS mounted (the ref must never vanish while
// the async player loads), and the placeholder/error overlays show
// INSIDE it when there is no video. This removes the mount race that
// made a pasted link silently do nothing.
//
// Every screen — host and guests alike — plays the video here. The host
// is just a client with the name "host": same frame, plus YouTube's
// own control bar for pressing play/pause.
// Props:
// - mountRef: ref from useYouTubePlayer; the player appears in this div
// - videoId: the active YouTube id (null = show the placeholder)
// - playerError: readable failure text from the player hook (null = fine)
// - isHost: gives the host YouTube's visible controls
// - needsJoinOverlay / onJoinPlayback: the guest's one-click join
// - isJoining: true during the join settle window — a loading overlay
//   covers the player while it catches up
//
// Guests also get an invisible CLICK BLOCKER over the video: clicks that
// would reach YouTube's player (pausing, jumping, opening YouTube) are
// swallowed by it instead. The host keeps YouTube's real controls.
const VideoPlayer = ({
  mountRef,
  videoId = null,
  playerError = null,
  isHost = false,
  needsJoinOverlay = false,
  onJoinPlayback,
  isJoining = false,
}) => {
  const showOverlay = videoId === null || playerError !== null

  return (
    <section className="video-player">
      <div ref={mountRef} className="video-player__frame">
        {/* guest shield: a transparent sheet ABOVE the iframe. Every
            pointer event over the video — move, hover, click, double-click
            — lands on THIS div, so YouTube's player never receives a
            mousemove or mouseenter (no hover controls, no pauses). */}
        {!isHost && videoId !== null && playerError === null && (
          <div
            className="video-player__blocker"
            aria-hidden="true"
            onClick={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
            onMouseMove={(event) => event.stopPropagation()}
            onMouseEnter={(event) => event.stopPropagation()}
            onMouseOver={(event) => event.stopPropagation()}
          />
        )}
        {/* join/admin settle window: the click registered — this loading
            overlay covers the player while it catches up */}
        {isJoining && (
          <div className="video-player__joining" role="status">
            <p>{isHost ? 'Starting the video...' : 'Joining the video...'}</p>
          </div>
        )}
        {/* browser refused autoplay (or is watching muted): one click
            seeks to the live position, plays, and unmutes — the single
            path to sound for guests (sits ABOVE the blocker) */}
        {needsJoinOverlay && !showOverlay && !isJoining && (
          <div className="video-player__join">
            <button type="button" className="button button--primary" onClick={onJoinPlayback}>
              Join the video
            </button>
          </div>
        )}
          {showOverlay && (
            <div
              className="video-player__placeholder"
              style={{
                background: '#d1d5db',
                color: '#111827',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'column',
                gap: '12px',
                textAlign: 'center',
              }}
            >
            {playerError !== null ? (
              <>
                <p>Video player problem</p>
                <p className="video-player__hint">{playerError}</p>
              </>
            ) : isHost ? (
              <>
                <p>No video yet</p>
                <p className="video-player__hint">Paste a YouTube link below to start the party.</p>
              </>
            ) : (
              <>
                <p>No video yet</p>
                <p className="video-player__hint">Waiting for the host to play something...</p>
              </>
            )}
          </div>
        )}
      </div>
    </section>
  )
}

export default VideoPlayer
