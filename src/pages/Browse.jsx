import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { LANG_NAMES } from '../context/I18nContext'
import Header from '../components/Header'
import { QuizCard } from '../components/QuizCard'
import { useI18n } from '../context/I18nContext'

export default function Browse() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { t } = useI18n()
  const [searchParams, setSearchParams] = useSearchParams()
  const [publicQuizzes, setPublicQuizzes] = useState([])
  const [starredIds, setStarredIds] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')

  // URL-driven filters (set by clicking tags on cards, or by the filter UI)
  const filterLang = searchParams.get('language') ?? ''
  const filterTopic = searchParams.get('topic') ?? ''
  const filterCreator = searchParams.get('creator') ?? ''

  function setFilter(key, value) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (value) next.set(key, value)
      else next.delete(key)
      return next
    }, { replace: true })
  }

  function clearFilters() {
    setSearch('')
    setSearchParams({}, { replace: true })
  }

  const hasFilters = search || filterLang || filterTopic || filterCreator

  useEffect(() => {
    supabase
      .from('quizzes')
      .select('id, title, is_public, language, topic, creator_id, questions(image_url, order_index)')
      .eq('is_public', true)
      .eq('questions.order_index', 0)
      .then(async ({ data, error: err }) => {
        if (err) { setError(err.message); setLoading(false); return }
        const quizzes = data ?? []

        // Fetch creator usernames for all quizzes that have a creator_id
        const creatorIds = [...new Set(quizzes.map((q) => q.creator_id).filter(Boolean))]
        let profileMap = {}
        if (creatorIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, username')
            .in('id', creatorIds)
          if (profiles) {
            profileMap = Object.fromEntries(profiles.map((p) => [p.id, p.username]))
          }
        }

        setPublicQuizzes(
          quizzes.map((q) => ({
            ...q,
            creator_username: profileMap[q.creator_id] ?? null,
          }))
        )
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

  // Derive unique filter options from loaded data
  const languageOptions = useMemo(() => (
    [...new Set(publicQuizzes.map((q) => q.language).filter(Boolean))].sort()
  ), [publicQuizzes])

  const topicOptions = useMemo(() => (
    [...new Set(publicQuizzes.map((q) => q.topic).filter(Boolean))].sort()
  ), [publicQuizzes])

  const filtered = useMemo(() => publicQuizzes.filter((q) => {
    if (search && !q.title.toLowerCase().includes(search.toLowerCase())) return false
    if (filterLang && q.language !== filterLang) return false
    if (filterTopic && q.topic !== filterTopic) return false
    if (filterCreator && !(q.creator_username ?? '').toLowerCase().includes(filterCreator.toLowerCase())) return false
    return true
  }), [publicQuizzes, search, filterLang, filterTopic, filterCreator])

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <div className="flex-1 px-6 py-6 max-w-7xl mx-auto w-full flex flex-col gap-6">
        {error && <p className="text-red-400 text-sm">{error}</p>}

        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">{t('browse.publicQuizzes')}</h2>

          {/* Filter row */}
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="search"
              placeholder={t('browse.search')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 w-40"
            />
            {languageOptions.length > 0 && (
              <select
                aria-label={t('browse.filterLanguage')}
                value={filterLang}
                onChange={(e) => setFilter('language', e.target.value)}
                className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
              >
                <option value="">{t('browse.allLanguages')}</option>
                {languageOptions.map((l) => (
                  <option key={l} value={l}>{LANG_NAMES[l] ?? l}</option>
                ))}
              </select>
            )}
            {topicOptions.length > 0 && (
              <select
                aria-label={t('browse.filterTopic')}
                value={filterTopic}
                onChange={(e) => setFilter('topic', e.target.value)}
                className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
              >
                <option value="">{t('browse.allTopics')}</option>
                {topicOptions.map((tp) => (
                  <option key={tp} value={tp}>{tp}</option>
                ))}
              </select>
            )}
            <input
              type="search"
              placeholder={t('browse.filterCreator')}
              value={filterCreator}
              onChange={(e) => setFilter('creator', e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 w-32"
            />
            {hasFilters && (
              <button
                onClick={clearFilters}
                className="text-xs text-gray-400 hover:text-gray-700 px-2 py-1.5 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors"
              >
                ✕
              </button>
            )}
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
