import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export default function Library() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [quizzes, setQuizzes] = useState([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(null)

  useEffect(() => {
    supabase
      .from('quizzes')
      .select('id, title, created_at')
      .eq('creator_id', user.id)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (!error) setQuizzes(data ?? [])
        setLoading(false)
      })
  }, [user.id])

  async function handleDelete(quizId) {
    if (!confirm('Delete this quiz? This cannot be undone.')) return
    setDeleting(quizId)
    const { error } = await supabase.from('quizzes').delete().eq('id', quizId)
    setDeleting(null)
    if (!error) setQuizzes((qs) => qs.filter((q) => q.id !== quizId))
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/')
  }

  return (
    <div className="min-h-screen bg-slate-900">
      <div className="max-w-2xl mx-auto px-4 py-8 flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">My Quizzes</h1>
            <p className="text-slate-400 text-sm mt-0.5">{user.email}</p>
          </div>
          <button
            onClick={handleLogout}
            className="text-sm text-slate-400 hover:text-slate-200 transition-colors"
          >
            Log out
          </button>
        </div>

        <Link
          to="/create"
          className="w-full text-center bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-lg transition-colors"
        >
          + Create new quiz
        </Link>

        {loading && <p className="text-slate-400 text-center py-8">Loading…</p>}

        {!loading && quizzes.length === 0 && (
          <p className="text-slate-500 text-center py-8">
            You haven't created any quizzes yet.
          </p>
        )}

        <div className="flex flex-col gap-3">
          {quizzes.map((quiz) => (
            <div
              key={quiz.id}
              className="bg-slate-800 rounded-xl px-5 py-4 flex items-center justify-between"
            >
              <div>
                <p className="font-medium">{quiz.title}</p>
                <p className="text-slate-500 text-xs mt-0.5">
                  {new Date(quiz.created_at).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  to={`/edit/${quiz.id}`}
                  className="bg-slate-600 hover:bg-slate-500 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
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
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
