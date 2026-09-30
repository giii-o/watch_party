// ============================================================
// The video facade: the ONLY door between the app and the
// video provider.
// ============================================================
// The rest of the app (pages, components, room logic) imports
// from HERE and never from a provider file. Today the provider
// is YouTube; adding another provider later (Vimeo, a raw file
// player, screen share) means adding a folder under
// providers/ and switching it here — no UI or logic changes.
//
// The facade promises these provider-neutral pieces:
// - extractVideoId(link)   -> provider video id or null
// - isValidVideoLink(link) -> can the provider play this link?
// - useVideoPlayer(videoId, onStateChange, showControls)
//       -> { mountRef, controls, playerError, isReady }
// - PLAYER_STATE           -> provider-neutral playback states
export { useVideoPlayer, PLAYER_STATE } from './providers/youtube/useYouTubePlayer.js'
export {
  extractVideoId,
  isValidVideoLink,
} from './providers/youtube/videoId.js'

// Which provider the facade currently hands out.
export const VIDEO_PROVIDER = 'youtube'

// What the current provider can and cannot do — the sync agent asks
// this before choosing its correction strategy.
// supportsContinuousRate: can the player run at e.g. 1.03x for the
// agent's soft rate nudge? YouTube's iframe only accepts DISCRETE
// speeds (0.75/1/1.25), so the nudge is OFF here — the agent holds
// speed and lets the hard-sync threshold do the work. A future
// plain-video provider flips this to true and gets soft sync.
export const PROVIDER_CAPABILITIES = {
  supportsContinuousRate: false,
}
