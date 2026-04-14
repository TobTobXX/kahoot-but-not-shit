import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

// Shared header bar — appears on all pages except Play and HostSession during active game.
export default function Header() {
  const { user, loading, signOut } = useAuth()
  const navigate = useNavigate()

  return (
    <header className="flex items-center gap-4 px-6 py-4">
      {/* Left: logo + library link */}
      <Link to="/" className="font-bold text-white hover:text-slate-200 transition-colors">
        Kbns
      </Link>
      <Link
        to="/host"
        className="text-sm text-slate-400 hover:text-white transition-colors"
      >
        Library
      </Link>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Right: auth controls */}
      {!loading && !user && (
        <button
          onClick={() => navigate('/login')}
          className="text-sm text-slate-300 hover:text-white transition-colors"
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
          <span className="text-sm text-slate-500">{user.email}</span>
          <button
            onClick={signOut}
            className="text-sm text-slate-400 hover:text-white transition-colors"
          >
            Log out
          </button>
        </>
      )}
    </header>
  )
}
