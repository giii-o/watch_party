import { Routes, Route } from 'react-router-dom'
import HomePage from './pages/HomePage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import SignupPage from './pages/SignupPage.jsx'
import DemoPage from './pages/DemoPage.jsx'
import RoomPage from './pages/RoomPage.jsx'
import PublicOnlyRoute from './components/PublicOnlyRoute.jsx'

// The router: picks which page to show based on the URL.
// - "/"             -> Demo landing (the public front door)
// - "/app"          -> App home (start/join a party)
// - "/login"        -> Login
// - "/room/:roomCode" -> Room (roomCode is read from the URL)
const App = () => {
  return (
    <Routes>
      <Route path="/" element={<DemoPage />} />
      <Route path="/app" element={<HomePage />} />
      <Route
        path="/login"
        element={
          <PublicOnlyRoute>
            <LoginPage />
          </PublicOnlyRoute>
        }
      />
      <Route
        path="/signup"
        element={
          <PublicOnlyRoute>
            <SignupPage />
          </PublicOnlyRoute>
        }
      />
      <Route path="/room/:roomCode" element={<RoomPage />} />
    </Routes>
  )
}

export default App
