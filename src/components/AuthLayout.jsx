import { Link } from 'react-router-dom'

// AuthLayout: the shared frame for the login/signup page —
// a centered card with the app name on top. The form goes inside as children.
// Props:
// - title: heading inside the card, e.g. "Log in"
// - children: the form (or anything else) to show inside the card
const AuthLayout = ({ title, children }) => {
  return (
    <main className="auth-layout">
      <Link to="/app" className="button button--small auth-layout__back">
        ← Back
      </Link>
      <Link to="/app" className="auth-layout__brand">
        Watch Party
      </Link>
      <div className="auth-layout__card card">
        <h1 className="auth-layout__title">{title}</h1>
        {children}
      </div>
    </main>
  )
}

export default AuthLayout
