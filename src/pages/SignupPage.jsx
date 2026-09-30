import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AuthLayout from '../components/AuthLayout.jsx'
import AuthForm from '../components/AuthForm.jsx'
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient.js'

// Signup page: creates the account with Supabase.
// Two outcomes:
// - Email confirmation is ON: Supabase emails a link; show "check your email".
//   (The built-in sender is rate-limited, so the mail can be slow or land in spam.)
// - Confirmation is OFF (common while developing): Supabase returns a session
//   right away, so we go straight to the home page, logged in.
const SignupPage = () => {
  const navigate = useNavigate()
  const [isBusy, setIsBusy] = useState(false)
  const [didSignUp, setDidSignUp] = useState(false)

  const handleSignup = async ({ email, password }) => {
    if (!isSupabaseConfigured) {
      throw new Error(
        'Supabase is not set up yet. Add your keys to a .env file (see src/lib/supabaseClient.js).',
      )
    }

    setIsBusy(true)
    try {
      const { data, error } = await supabase.auth.signUp({ email, password })
      if (error) {
        throw error
      }
      // data.session exists only when NO email confirmation is required.
      // Then the user is logged in immediately — go straight home.
      if (data.session) {
        navigate('/app')
        return
      }
      setDidSignUp(true) // confirmation required: show the "check your email" message
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <AuthLayout title="Create your account">
      {didSignUp ? (
        <p className="auth-form__success">
          Account created! Check your email for a confirmation link, then{' '}
          <Link to="/login">log in</Link>.
        </p>
      ) : (
        <>
          {!isSupabaseConfigured && (
            <p className="auth-form__notice">
              Supabase keys are missing — the form will show an error until you
              add them to <code>.env</code> (instructions in{' '}
              <code>src/lib/supabaseClient.js</code>).
            </p>
          )}
          <AuthForm mode="signup" onSubmit={handleSignup} isDisabled={isBusy} />
          <p className="auth-form__switch">
            Already have an account? <Link to="/login">Log in</Link>
          </p>
        </>
      )}
    </AuthLayout>
  )
}

export default SignupPage
