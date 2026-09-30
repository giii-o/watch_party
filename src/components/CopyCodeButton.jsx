import { useEffect, useRef, useState } from 'react'

// CopyCodeButton: copies the room code to the clipboard.
// Anyone in the party can use it — host and guests alike.
//
// States: idle ("Copy code") -> copied ("Copied", 2s) -> back to idle.
// The clipboard API only works in secure contexts (https, localhost);
// there is a manual fallback for everything else.
const CopyCodeButton = ({ roomCode }) => {
  const [status, setStatus] = useState('idle') // 'idle' | 'copied' | 'failed'
  const timerRef = useRef(null)

  // Clear the feedback timer when the button leaves the page.
  useEffect(() => () => clearTimeout(timerRef.current), [])

  const handleCopy = async () => {
    let didCopy = false
    try {
      await navigator.clipboard.writeText(roomCode)
      didCopy = true
    } catch {
      // Fallback for older browsers / insecure contexts:
      // select a hidden textarea and use the classic copy command.
      try {
        const helper = document.createElement('textarea')
        helper.value = roomCode
        document.body.appendChild(helper)
        helper.select()
        document.execCommand('copy')
        document.body.removeChild(helper)
        didCopy = true
      } catch {
        didCopy = false
      }
    }

    setStatus(didCopy ? 'copied' : 'failed')
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setStatus('idle'), 2000)
  }

  const label =
    status === 'copied' ? 'Copied' : status === 'failed' ? 'Copy failed' : 'Copy code'

  return (
    <button
      type="button"
      className={`button button--small${status === 'copied' ? ' copy-button--copied' : ''}`}
      onClick={handleCopy}
      aria-live="polite"
    >
      {label}
    </button>
  )
}

export default CopyCodeButton
