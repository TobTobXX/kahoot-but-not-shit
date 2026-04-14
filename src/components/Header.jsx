import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

// Shared header bar — appears on all pages except Play and HostSession during active game.
export default function Header() {
  const { user, loading, signOut } = useAuth()
  const navigate = useNavigate()

  return (
    <header className="flex items-center gap-4 px-6 py-4">
      {/* Left: logo + library link */}
      <Link to="/" className="text-4xl font-bold text-gray-900 hover:text-gray-700 transition-colors">
        Kbns
      </Link>
      <Link
        to="/host"
        className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
      >
        Library
      </Link>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Right: auth controls */}
      {!loading && !user && (
        <button
          onClick={() => navigate('/login')}
          className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
        >
          Log in
        </button>
      )}
      {!loading && user && (
        <>
          <button
            onClick={() => navigate('/create')}
            className="text-sm bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-4 py-1.5 rounded-lg transition-colors"
          >
            Create
          </button>
          <span className="text-sm text-gray-400">{user.email}</span>
          <Link
            to="/profile"
            className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
          >
            Profile
          </Link>
          <button
            onClick={signOut}
            className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
          >
            Log out
          </button>
        </>
      )}
    </header>
  )
}
