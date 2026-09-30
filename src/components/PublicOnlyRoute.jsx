import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient.js'

// PublicOnlyRoute: a wrapper for pages meant only for logged-OUT users
// (login, signup). If a session already exists, it sends the user to the
// app home (/app) instead of showing the form.
//
// Three states, in order:
// - 'checking':  the session is being read — render nothing for a beat,
//                so the login form never flashes before the redirect
// - 'loggedIn':  session found -> <Navigate> sends the user home.
//                "replace" swaps the URL in the history, so the back
//                button does not drop the user onto /login again
// - 'loggedOut': no session -> show the page (children) as normal
const PublicOnlyRoute = ({ children }) => {
  const [authState, setAuthState] = useState('checking')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setAuthState(data.session ? 'loggedIn' : 'loggedOut')
    })
  }, [])

  if (authState === 'checking') {
    return null
  }

  if (authState === 'loggedIn') {
    // The app home lives at /app now — sending a logged-in user to "/"
    // would drop them on the public demo landing instead.
    return <Navigate to="/app" replace />
  }

  return children
}

export default PublicOnlyRoute
