import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import Header from '../components/Header'
import { QuizCard, Section } from '../components/QuizCard'
import { useI18n } from '../context/I18nContext'

export default function Browse() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { t } = useI18n()
  const [publicQuizzes, setPublicQuizzes] = useState([])
  const [starredIds, setStarredIds] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    supabase
      .from('quizzes')
      .select('id, title, is_public, language, topic, questions(image_url, order_index)')
      .eq('is_public', true)
      .eq('questions.order_index', 0)
      .then(({ data, error: err }) => {
        if (err) setError(err.message)
        else setPublicQuizzes(data ?? [])
        setLoading(false)
      })
  }, [])

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

  async function handleStar(quizId) {
    if (starredIds.has(quizId)) {
      await supabase.from('starred_quizzes').delete().eq('quiz_id', quizId)
      setStarredIds((s) => { const n = new Set(s); n.delete(quizId); return n })
    } else {
      await supabase.from('starred_quizzes').insert({ user_id: user.id, quiz_id: quizId })
      setStarredIds((s) => new Set([...s, quizId]))
    }
  }

  const filtered = publicQuizzes.filter(
    (q) => q.title.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <div className="flex-1 px-6 py-6 max-w-7xl mx-auto w-full flex flex-col gap-8">
        {error && <p className="text-red-400 text-sm">{error}</p>}

        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-4">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{t('browse.publicQuizzes')}</h2>
            <input
              type="search"
              placeholder={t('browse.search')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 max-w-xs border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>
          {filtered.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {filtered.map((quiz) => (
                <QuizCard
                  key={quiz.id}
                  quiz={quiz}
                  isOwn={false}
                  starred={starredIds.has(quiz.id)}
                  user={user}
                  t={t}
                  onHost={() => createSession(quiz.id)}
                  onStar={() => handleStar(quiz.id)}
                />
              ))}
            </div>
          ) : (
            !loading && <p className="text-gray-400 text-sm">{t('browse.noPublicQuizzes')}</p>
          )}
        </div>
      </div>
    </div>
  )
}
