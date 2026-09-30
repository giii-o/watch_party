import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AuthLayout from '../components/AuthLayout.jsx'
import AuthForm from '../components/AuthForm.jsx'
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient.js'

// Login page: signs the user in with Supabase.
// If the Supabase keys are not set up yet (.env missing), the form shows a
// friendly hint instead of crashing.
//
// Special case: if the account's email was never confirmed, Supabase
// refuses the login ("Email not confirmed"). Instead of a dead end we
// show a message and a "Resend confirmation email" button.
const LoginPage = () => {
  const navigate = useNavigate()
  const [isBusy, setIsBusy] = useState(false)
  const [unconfirmedEmail, setUnconfirmedEmail] = useState('')
  const [resendMessage, setResendMessage] = useState('')

  const handleLogin = async ({ email, password }) => {
    if (!isSupabaseConfigured) {
      throw new Error(
        'Supabase is not set up yet. Add your keys to a .env file (see src/lib/supabaseClient.js).',
      )
    }

    setIsBusy(true)
    setResendMessage('')
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        // Supabase's message for this case is "Email not confirmed".
        if (String(error.message).toLowerCase().includes('not confirmed')) {
          setUnconfirmedEmail(email) // remembered for the resend button
        }
        throw error
      }
      navigate('/app') // logged in — into the app home
    } finally {
      setIsBusy(false)
    }
  }

  const handleResendConfirmation = async () => {
    setResendMessage('')
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: unconfirmedEmail,
    })
    setResendMessage(
      error
        ? `Could not resend: ${error.message}`
        : 'Confirmation email sent. Check your inbox (and spam folder).',
    )
  }

  return (
    <AuthLayout title="Welcome back">
      {!isSupabaseConfigured && (
        <p className="auth-form__notice">
          Supabase keys are missing — the form will show an error until you add
          them to <code>.env</code> (instructions in{' '}
          <code>src/lib/supabaseClient.js</code>).
        </p>
      )}

      {unconfirmedEmail !== '' && (
        <div className="auth-form__resend">
          <p>
            Your email is not confirmed yet. Click the link in the email we sent
            you — or resend it:
          </p>
          <button className="button button--small" onClick={handleResendConfirmation}>
            Resend confirmation email
          </button>
          {resendMessage !== '' && <p className="auth-form__success">{resendMessage}</p>}
        </div>
      )}

      <AuthForm mode="login" onSubmit={handleLogin} isDisabled={isBusy} />
      <p className="auth-form__switch">
        No account yet? <Link to="/signup">Sign up</Link>
      </p>
    </AuthLayout>
  )
}

export default LoginPage
