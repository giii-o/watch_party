// Helpers for turning pasted video links into what the YouTube player needs.
//
// The YouTube iframe player does not take a normal
// watch URL — it needs the 11-character VIDEO ID, e.g. "dQw4w9WgXcQ".
// People paste links in many shapes:
//   https://www.youtube.com/watch?v=dQw4w9WgXcQ
//   https://www.youtube.com/watch?app=desktop&v=dQw4w9WgXcQ  (v= not first!)
//   https://youtu.be/dQw4w9WgXcQ
//   https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s
//   https://m.youtube.com/watch?v=dQw4w9WgXcQ
//   https://www.youtube.com/shorts/dQw4w9WgXcQ
//   https://www.youtube.com/live/dQw4w9WgXcQ
//   https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ
// So we dig the ID out with one regular expression.

const YOUTUBE_ID_PATTERN =
  /(?:youtube(?:-nocookie)?\.com\/(?:watch\?.*?\bv=|shorts\/|live\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/

// Returns the 11-character YouTube video id, or null if the link
// is not a YouTube link we understand.
const extractVideoId = (url) => {
  const match = String(url).match(YOUTUBE_ID_PATTERN)
  return match === null ? null : match[1]
}

// Checks a link BEFORE sending it anywhere, so the user gets
// instant feedback without a network round-trip.
const isValidVideoLink = (url) => extractVideoId(url) !== null

export { extractVideoId, isValidVideoLink }
