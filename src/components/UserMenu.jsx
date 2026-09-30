import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

// UserMenu: shows who is logged in and offers a Log out button.
// When nobody is logged in it shows a Log in link instead.
//
// How it knows: Supabase saves the session automatically after login.
// getSession() reads it once; onAuthStateChange() fires whenever it
// changes (login, logout, token refresh) so the menu stays up to date.
const UserMenu = () => {
  const [userEmail, setUserEmail] = useState(null)

  useEffect(() => {
    // 1. Read the current session once when the component appears
    supabase.auth.getSession().then((response) => {
      setUserEmail(response.data.session?.user?.email ?? null)
    })

    // 2. Keep listening for auth changes while the component is on screen
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user?.email ?? null)
    })

    // Cleanup: stop listening when the component disappears
    return () => {
      data.subscription.unsubscribe()
    }
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
  }

  if (userEmail === null) {
    return (
      <p className="user-menu">
        <Link to="/login">Log in</Link>
        <span>to start your own party</span>
      </p>
    )
  }

  return (
    <p className="user-menu">
      <span>
        Logged in as <strong>{userEmail}</strong>
      </span>
      <button className="button button--small" onClick={handleLogout}>
        Log out
      </button>
    </p>
  )
}

export default UserMenu
