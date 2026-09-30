import { useState } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient.js'

// DemoPage: the public landing page. One big button in the middle —
// "Sign up for a chance at the demo" — with a short app description
// under it. The click reveals a small email-only form; submitting
// stores the email in the demo_signups table (insert-only: visitors
// cannot read anyone else's signup).
//
// The page is at /demo and is NOT linked from the app's own pages —
// it is the front door for people who do not have an account yet.
const DemoPage = () => {
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState('idle') // idle | saving | done | error
  const [errorMessage, setErrorMessage] = useState('')

  const handleEmailChange = (event) => setEmail(event.target.value)

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

  if (status === 'done') {
    return (
      <main className="demo-page">
        <h1 className="demo-page__title">You're on the list.</h1>
        <p className="demo-page__blurb">
          We'll email your demo invite to <strong>{email}</strong>. Keep an eye
          on your inbox.
        </p>
      </main>
    )
  }

  return (
    <main className="demo-page">
      <button
        type="button"
        className="button button--primary demo-page__cta"
        onClick={() => setIsFormOpen(true)}
      >
        Sign up for a chance at the demo
      </button>

      <p className="demo-page__blurb">
        Watch Party plays one video in perfect sync for everyone in the room —
        the host plays, everyone follows. Start a party, share a short code,
        and watch together from anywhere.
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
        </form>
      )}
    </main>
  )
}

export default DemoPage
