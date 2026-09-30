import { useState } from 'react'
import { isValidVideoLink } from '../video/index.js'

// VideoLinkForm: the host's one input — paste a YouTube link and the
// whole room switches to it. (It replaces the removed playlist; a queue
// can come back later if you want it.)
// Props:
// - onSetVideo: called with a VALID link when the host submits
// - isBusy: true while the link is being applied
// - error: error text from the room page (e.g. a database refusal)
const VideoLinkForm = ({ onSetVideo, isBusy = false, error = '' }) => {
  const [link, setLink] = useState('')
  const [localError, setLocalError] = useState('')

  const handleLinkChange = (event) => {
    setLink(event.target.value)
    setLocalError('')
  }

  const handleSetVideo = (event) => {
    event.preventDefault()

    if (link.trim() === '') {
      setLocalError('Paste a video link first.')
      return
    }
    if (!isValidVideoLink(link)) {
      setLocalError('That does not look like a YouTube link.')
      return
    }

    try {
      onSetVideo(link.trim())
    } catch (error) {
      // onSetVideo is async; synchronous throws are surfaced here,
      // async errors are surfaced through the error prop.
      setLocalError(error.message)
    }
    setLink('')
  }

  const shownError = localError !== '' ? localError : error

  return (
    <form className="video-link-form" onSubmit={handleSetVideo}>
      <input
        className="input"
        type="url"
        placeholder="Paste a YouTube link..."
        value={link}
        onChange={handleLinkChange}
        aria-label="Video link"
      />
      <button className="button button--primary" type="submit" disabled={isBusy}>
        {isBusy ? 'Setting...' : 'Watch'}
      </button>
      {shownError !== '' && (
        <p className="video-link-form__error" role="alert">
          {shownError}
        </p>
      )}
    </form>
  )
}

export default VideoLinkForm
