import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import Header from './Header'

// Shown at /host (no active session). Lists quizzes and lets the host start a session.
export default function HostLibrary() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [publicQuizzes, setPublicQuizzes] = useState([])
  const [ownQuizzes, setOwnQuizzes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [deleting, setDeleting] = useState(null)

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
      .select('id, title, creator_id, created_at')
      .eq('creator_id', user.id)
      .then(({ data }) => {
        if (data) setOwnQuizzes(data)
      })
  }, [user])

  async function createSession(quizId) {
    const { data, error: err } = await supabase.rpc('create_session', { p_quiz_id: quizId })
    if (err) { setError(err.message); return }
    localStorage.setItem(`host_${data.session_id}`, data.host_secret)
    navigate(`/host?sessionId=${data.session_id}`)
  }

  async function handleDelete(quizId) {
    if (!confirm('Delete this quiz? This cannot be undone.')) return
    setDeleting(quizId)
    const { error: delErr } = await supabase.from('quizzes').delete().eq('id', quizId)
    setDeleting(null)
    if (delErr) {
      setError(delErr.message)
    } else {
      setOwnQuizzes((qs) => qs.filter((q) => q.id !== quizId))
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <div className="flex-1 flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-md flex flex-col gap-6">
          {error && <p className="text-red-400 text-sm">{error}</p>}

        <Link
          to="/create"
          className="w-full text-center border-2 border-dashed border-gray-300 hover:border-indigo-500 hover:bg-indigo-50 text-gray-500 hover:text-indigo-500 font-semibold py-3 rounded-xl transition-colors"
        >
          + Create a new quiz
        </Link>

        {ownQuizzes.length > 0 && (
          <div className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">My Quizzes</h2>
            {ownQuizzes.map((quiz) => (
              <div key={quiz.id} className="bg-indigo-50 rounded-xl px-5 py-4 flex items-center justify-between">
                <div>
                  <span className="font-medium">{quiz.title}</span>
                  <p className="text-gray-400 text-xs mt-0.5">
                    {new Date(quiz.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    to={`/edit?quizId=${quiz.id}`}
                    className="text-sm text-gray-500 hover:text-gray-900 transition-colors px-2 py-1"
                  >
                    Edit
                  </Link>
                  <button
                    onClick={() => handleDelete(quiz.id)}
                    disabled={deleting === quiz.id}
                    className="text-sm text-red-400 hover:text-red-300 disabled:opacity-50 transition-colors"
                  >
                    {deleting === quiz.id ? 'Deleting…' : 'Delete'}
                  </button>
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
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Public Quizzes</h2>
            {publicQuizzes.map((quiz) => (
              <div key={quiz.id} className="bg-indigo-50 rounded-xl px-5 py-4 flex items-center justify-between">
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
          <p className="text-gray-400 text-center py-8">No quizzes available.</p>
        )}
        </div>
      </div>
    </div>
  )
}
