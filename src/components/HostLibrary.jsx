import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

function generateJoinCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

// Shown at /host (no active session). Lists quizzes and lets the host start a session.
export default function HostLibrary() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [publicQuizzes, setPublicQuizzes] = useState([])
  const [ownQuizzes, setOwnQuizzes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    supabase
      .from('quizzes')
      .select('id, title, creator_id, is_public')
      .eq('is_public', true)
      .then(({ data, error: err }) => {
        if (err) setError(err.message)
        else setPublicQuizzes(data ?? [])
        setLoading(false)
      })
  }, [])

  useEffect(() => {
    if (!user) return
    supabase
      .from('quizzes')
      .select('id, title, creator_id')
      .eq('creator_id', user.id)
      .then(({ data }) => {
        if (data) setOwnQuizzes(data)
      })
  }, [user])

  async function createSession(quizId) {
    const code = generateJoinCode()
    const { data, error: err } = await supabase
      .from('sessions')
      .insert({ quiz_id: quizId, join_code: code, state: 'waiting' })
      .select('id')
      .single()
    if (err) {
      setError(err.message)
    } else {
      navigate(`/host/${data.id}`)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-md flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Host</h1>
          {user ? (
            <div className="flex items-center gap-3">
              <Link
                to="/library"
                className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                My quizzes
              </Link>
              <button
                onClick={() => supabase.auth.signOut()}
                className="text-sm text-slate-400 hover:text-slate-200 transition-colors"
              >
                Log out
              </button>
            </div>
          ) : (
            <Link
              to="/login"
              className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              Sign in
            </Link>
          )}
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <Link
          to="/create"
          className="w-full text-center border-2 border-dashed border-slate-600 hover:border-indigo-500 hover:bg-indigo-950 text-slate-400 hover:text-indigo-300 font-semibold py-3 rounded-xl transition-colors"
        >
          + Create a new quiz
        </Link>

        {ownQuizzes.length > 0 && (
          <div className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">My Quizzes</h2>
            {ownQuizzes.map((quiz) => (
              <div key={quiz.id} className="bg-slate-800 rounded-xl px-5 py-4 flex items-center justify-between">
                <span className="font-medium">{quiz.title}</span>
                <div className="flex items-center gap-2">
                  <Link
                    to={`/edit/${quiz.id}`}
                    className="text-sm text-slate-400 hover:text-white transition-colors px-2 py-1"
                  >
                    Edit
                  </Link>
                  <button
                    onClick={() => createSession(quiz.id)}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
                  >
                    Host
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {publicQuizzes.length > 0 && (
          <div className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">Public Quizzes</h2>
            {publicQuizzes.map((quiz) => (
              <div key={quiz.id} className="bg-slate-800 rounded-xl px-5 py-4 flex items-center justify-between">
                <span className="font-medium">{quiz.title}</span>
                <button
                  onClick={() => createSession(quiz.id)}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
                >
                  Host
                </button>
              </div>
            ))}
          </div>
        )}

        {!loading && publicQuizzes.length === 0 && ownQuizzes.length === 0 && (
          <p className="text-slate-500 text-center py-8">No quizzes available.</p>
        )}
      </div>
    </div>
  )
}
