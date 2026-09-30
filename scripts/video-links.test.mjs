// Plain Node test for the video link parser (no framework needed).
// Run with:  node scripts/video-links.test.mjs
import { extractVideoId } from '../src/video/providers/youtube/videoId.js'

const cases = [
  // [url, expected id]
  ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
  ['https://youtu.be/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
  ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s', 'dQw4w9WgXcQ'],
  ['https://m.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
  ['https://www.youtube.com/watch?app=desktop&v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
  ['https://www.youtube.com/shorts/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
  ['https://www.youtube.com/live/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
  ['https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
  ['https://example.com/not-a-video', null],
  ['https://www.youtube.com/watch?v=tooshort', null],
  ['not a url at all', null],
]

let failures = 0
for (const [url, expected] of cases) {
  const actual = extractVideoId(url)
  const passed = actual === expected
  if (!passed) {
    failures += 1
  }
  console.log(
    `${passed ? 'PASS' : 'FAIL'}  ${url}\n      expected: ${expected}  actual: ${actual}`,
  )
}

console.log(`\n${cases.length - failures}/${cases.length} passed`)
if (failures > 0) {
  process.exitCode = 1
}
