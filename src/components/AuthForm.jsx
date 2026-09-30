import { useState } from 'react'

// AuthForm: one reusable form for BOTH login and signup.
// Props:
// - mode: "login" or "signup" — switches labels and the submit text
// - onSubmit: function that receives ({ email, password }). Returns a promise;
//   while it runs the button shows a loading state. If it throws, the error is shown.
// - isDisabled: true while auth is being checked
const AuthForm = ({ mode, onSubmit, isDisabled = false }) => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const isSignup = mode === 'signup'

  const handleEmailChange = (event) => setEmail(event.target.value)
  const handlePasswordChange = (event) => setPassword(event.target.value)

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')

    // Basic checks first — no service call needed for these
    if (!email.includes('@')) {
      setError('Please enter a valid email address.')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    try {
      await onSubmit({ email, password })
      // On success the page usually navigates away, so nothing to do here.
    } catch (submitError) {
      setError(submitError.message)
    }
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <label className="field">
        <span className="field__label">Email</span>
        <input
          className="input"
          type="email"
          value={email}
          onChange={handleEmailChange}
          placeholder="you@example.com"
          autoComplete="email"
        />
      </label>

      <label className="field">
        <span className="field__label">Password</span>
        <input
          className="input"
          type="password"
          value={password}
          onChange={handlePasswordChange}
          placeholder="At least 8 characters"
          autoComplete={isSignup ? 'new-password' : 'current-password'}
        />
      </label>

      {error !== '' && (
        <p className="auth-form__error" role="alert">
          {error}
        </p>
      )}

      <button className="button button--primary" type="submit" disabled={isDisabled}>
        {isDisabled ? 'Please wait...' : isSignup ? 'Create account' : 'Log in'}
      </button>

      <p className="auth-form__min-length">Password must be at least 8 characters.</p>
    </form>
  )
}

export default AuthForm
