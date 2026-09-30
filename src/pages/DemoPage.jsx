import { useState } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient.js'

// DemoPage: the public landing page — the front door at "/".
// Look: a quiet night sky (pure CSS: stars + clouds, no image asset)
// spanning the full screen, the "Watch Party" wordmark LARGE in the
// middle, and one big CTA below it. The click reveals a small
// email-only form with its own Close button; submitting stores the
// email in the demo_signups table (insert-only: visitors cannot read
// anyone else's signup).
const DemoPage = () => {
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState('idle') // idle | saving | done | error
  const [errorMessage, setErrorMessage] = useState('')

  const handleEmailChange = (event) => setEmail(event.target.value)

  const openForm = () => setIsFormOpen(true)

  // Collapse the form but keep what was typed — reopening should not
  // punish a mis-tap. Errors clear so the form reopens clean.
  const closeForm = () => {
    setIsFormOpen(false)
    setStatus('idle')
    setErrorMessage('')
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setStatus('saving')
    setErrorMessage('')

    // Basic check first — no service call needed for this
    if (!email.includes('@')) {
      setErrorMessage('Please enter a valid email address.')
      setStatus('error')
      return
    }

    // Supabase not set up (no .env yet): be honest instead of failing.
    if (!isSupabaseConfigured) {
      setErrorMessage(
        'The waitlist is not connected yet — add your Supabase keys to .env (see src/lib/supabaseClient.js).',
      )
      setStatus('error')
      return
    }

    try {
      const { error } = await supabase.from('demo_signups').insert({ email })
      if (error) {
        throw error
      }
      setStatus('done') // success: swap the form for a thank-you
    } catch (signupError) {
      setErrorMessage(signupError.message)
      setStatus('error')
    }
  }

  return (
    <main className="demo-page">
      {/* the wordmark: pinned at the TOP CENTER, large */}
      <header className="demo-header">
        <h1 className="demo-page__brand">Watch Party</h1>
      </header>

      <div className="demo-page__inner">
        {status === 'done' ? (
          <p className="demo-page__blurb">
            You're on the list — we'll email your demo invite to{' '}
            <strong>{email}</strong>. Keep an eye on your inbox.
          </p>
        ) : (
          <>
            <button
              type="button"
              className="button button--primary demo-page__cta"
              onClick={openForm}
            >
              Sign up for a chance at the demo
            </button>

            <p className="demo-page__blurb">
              Watch Party plays one video in perfect sync for everyone in the
              room — the host plays, everyone follows. Start a party, share a
              short code, and watch together from anywhere.
            </p>

            {isFormOpen && (
              <form className="demo-page__form" onSubmit={handleSubmit}>
                <label className="field">
                  <span className="field__label">Email</span>
                  <input
                    className="input"
                    type="email"
                    value={email}
                    onChange={handleEmailChange}
                    placeholder="you@example.com"
                    autoComplete="email"
                    autoFocus
                  />
                </label>

                {status === 'error' && errorMessage !== '' && (
                  <p className="demo-page__error" role="alert">
                    {errorMessage}
                  </p>
                )}

                <button
                  className="button button--primary"
                  type="submit"
                  disabled={status === 'saving'}
                >
                  {status === 'saving' ? 'Sending...' : 'Request the demo'}
                </button>

                <button
                  type="button"
                  className="demo-page__close"
                  onClick={closeForm}
                >
                  Close
                </button>
              </form>
            )}
          </>
        )}
      </div>
    </main>
  )
}

export default DemoPage
