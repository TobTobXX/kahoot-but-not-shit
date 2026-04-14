import { useEffect, useRef, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { exportQuiz, importQuiz } from '../lib/quizExport'
import Header from './Header'

function PlaceholderThumb() {
  return (
    <div className="w-full h-full flex items-center justify-center bg-indigo-100">
      <svg viewBox="0 0 48 48" className="w-12 h-12 text-indigo-300" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="6" y="10" width="36" height="28" rx="3" />
        <circle cx="18" cy="20" r="4" />
        <path d="M6 32 l10-8 8 7 6-5 12 9" />
      </svg>
    </div>
  )
}

function QuizCard({ quiz, isOwn, starred, onHost, onEdit, onExport, onDelete, onStar, exporting, deleting, user }) {
  const thumb = quiz.questions?.[0]?.image_url

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden flex flex-col shadow-sm hover:shadow-md transition-shadow">
      {/* Thumbnail */}
      <div className="relative w-full h-32 bg-indigo-50 flex-shrink-0">
        {thumb
          ? <img src={thumb} alt="" className="w-full h-full object-cover" />
          : <PlaceholderThumb />
        }
        {user && !isOwn && (
          <button
            onClick={onStar}
            title={starred ? 'Unstar' : 'Star'}
            className="absolute top-2 right-2 p-1.5 rounded-full bg-white/80 hover:bg-white transition-colors shadow-sm"
          >
            {starred
              ? <span className="text-yellow-400 text-base leading-none">★</span>
              : <span className="text-gray-400 text-base leading-none">☆</span>
            }
          </button>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-col flex-1 px-3 py-2 gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-gray-900 leading-tight line-clamp-2">{quiz.title}</p>
          {quiz.created_at && (
            <p className="text-xs text-gray-400 mt-0.5">{quiz.created_at.slice(0, 10)}</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-wrap justify-end">
          {isOwn && (
            <>
              <Link
                to={`/edit?quizId=${quiz.id}`}
                className="text-xs text-gray-500 hover:text-gray-900 px-2 py-1 rounded transition-colors"
              >
                Edit
              </Link>
              <button
                onClick={onExport}
                disabled={exporting}
                className="text-xs text-gray-500 hover:text-gray-900 disabled:opacity-50 px-2 py-1 rounded transition-colors"
              >
                {exporting ? '…' : 'Export'}
              </button>
              <button
                onClick={onDelete}
                disabled={deleting}
                className="text-xs text-red-400 hover:text-red-600 disabled:opacity-50 px-2 py-1 rounded transition-colors"
              >
                {deleting ? '…' : 'Delete'}
              </button>
            </>
          )}
          <button
            onClick={onHost}
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
          >
            Host
          </button>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">{title}</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {children}
      </div>
    </div>
  )
}

export default function HostLibrary() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [publicQuizzes, setPublicQuizzes] = useState([])
  const [ownQuizzes, setOwnQuizzes] = useState([])
  const [starredIds, setStarredIds] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [exporting, setExporting] = useState(null)
  const [importing, setImporting] = useState(false)
  const [search, setSearch] = useState('')
  const importInputRef = useRef(null)

  // Fetch public quizzes with first-question thumbnail
  useEffect(() => {
    supabase
      .from('quizzes')
      .select('id, title, is_public, questions(image_url, order_index)')
      .eq('is_public', true)
      .eq('questions.order_index', 0)
      .then(({ data, error: err }) => {
        if (err) setError(err.message)
        else setPublicQuizzes(data ?? [])
        setLoading(false)
      })
  }, [])

  // Fetch own quizzes with first-question thumbnail
  useEffect(() => {
    if (!user) return
    supabase
      .from('quizzes')
      .select('id, title, creator_id, created_at, questions(image_url, order_index)')
      .eq('creator_id', user.id)
      .eq('questions.order_index', 0)
      .then(({ data }) => {
        if (data) setOwnQuizzes(data)
      })
  }, [user])

  // Fetch starred quiz IDs for logged-in user
  useEffect(() => {
    if (!user) return
    supabase
      .from('starred_quizzes')
      .select('quiz_id')
      .then(({ data }) => {
        if (data) setStarredIds(new Set(data.map((r) => r.quiz_id)))
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

  async function handleExport(quiz) {
    setExporting(quiz.id)
    try {
      const json = await exportQuiz(supabase, quiz.id)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${quiz.title.replace(/[^a-z0-9]/gi, '_')}.quiz.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err.message)
    }
    setExporting(null)
  }

  async function handleImport(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setImporting(true)
    try {
      const text = await file.text()
      await importQuiz(supabase, user.id, text)
      const { data } = await supabase
        .from('quizzes')
        .select('id, title, creator_id, created_at, questions(image_url, order_index)')
        .eq('creator_id', user.id)
        .eq('questions.order_index', 0)
      if (data) setOwnQuizzes(data)
    } catch (err) {
      setError(err.message)
    }
    setImporting(false)
  }

  async function handleStar(quizId) {
    if (starredIds.has(quizId)) {
      await supabase.from('starred_quizzes').delete().eq('quiz_id', quizId)
      setStarredIds((s) => { const n = new Set(s); n.delete(quizId); return n })
    } else {
      await supabase.from('starred_quizzes').insert({ user_id: user.id, quiz_id: quizId })
      setStarredIds((s) => new Set([...s, quizId]))
    }
  }

  const filteredPublic = publicQuizzes.filter(
    (q) => q.title.toLowerCase().includes(search.toLowerCase())
  )
  const starredQuizzes = filteredPublic.filter((q) => starredIds.has(q.id))
  const unstarredPublic = filteredPublic.filter((q) => !starredIds.has(q.id))

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <div className="flex-1 px-6 py-6 max-w-7xl mx-auto w-full flex flex-col gap-8">
        {error && <p className="text-red-400 text-sm">{error}</p>}

        {/* Create / Import */}
        {user && (
          <div className="flex gap-2">
            <Link
              to="/create"
              className="flex-1 text-center border-2 border-dashed border-gray-300 hover:border-indigo-500 hover:bg-indigo-50 text-gray-500 hover:text-indigo-500 font-semibold py-3 rounded-xl transition-colors"
            >
              + Create a new quiz
            </Link>
            <input
              ref={importInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleImport}
            />
            <button
              type="button"
              onClick={() => importInputRef.current?.click()}
              disabled={importing}
              className="border-2 border-dashed border-gray-300 hover:border-indigo-500 hover:bg-indigo-50 text-gray-500 hover:text-indigo-500 font-semibold px-4 py-3 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {importing ? 'Importing…' : 'Import'}
            </button>
          </div>
        )}

        {/* My Quizzes */}
        {ownQuizzes.length > 0 && (
          <Section title="My Quizzes">
            {ownQuizzes.map((quiz) => (
              <QuizCard
                key={quiz.id}
                quiz={quiz}
                isOwn
                user={user}
                onHost={() => createSession(quiz.id)}
                onEdit={() => {}}
                onExport={() => handleExport(quiz)}
                onDelete={() => handleDelete(quiz.id)}
                exporting={exporting === quiz.id}
                deleting={deleting === quiz.id}
              />
            ))}
          </Section>
        )}

        {/* Starred Quizzes */}
        {starredQuizzes.length > 0 && (
          <Section title="Starred">
            {starredQuizzes.map((quiz) => (
              <QuizCard
                key={quiz.id}
                quiz={quiz}
                isOwn={false}
                starred
                user={user}
                onHost={() => createSession(quiz.id)}
                onStar={() => handleStar(quiz.id)}
              />
            ))}
          </Section>
        )}

        {/* Search + Public Quizzes */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-4">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Public Quizzes</h2>
            <input
              type="search"
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 max-w-xs border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>
          {unstarredPublic.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {unstarredPublic.map((quiz) => (
                <QuizCard
                  key={quiz.id}
                  quiz={quiz}
                  isOwn={false}
                  starred={false}
                  user={user}
                  onHost={() => createSession(quiz.id)}
                  onStar={() => handleStar(quiz.id)}
                />
              ))}
            </div>
          ) : (
            !loading && <p className="text-gray-400 text-sm">No public quizzes found.</p>
          )}
        </div>
      </div>
    </div>
  )
}
