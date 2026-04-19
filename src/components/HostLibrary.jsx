import { useEffect, useRef, useState } from 'react'
import { useNavigate, Navigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { exportQuiz, importQuiz } from '../lib/quizExport'
import Header from './Header'
import { QuizCard, Section } from './QuizCard'
import { useI18n } from '../context/I18nContext'

export default function HostLibrary() {
  const { user, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const { t } = useI18n()
  const [ownQuizzes, setOwnQuizzes] = useState([])
  const [starredQuizzes, setStarredQuizzes] = useState([])
  const [error, setError] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [exporting, setExporting] = useState(null)
  const [importing, setImporting] = useState(false)
  const importInputRef = useRef(null)

  // Fetch own quizzes with first-question thumbnail
  useEffect(() => {
    if (!user) return
    supabase
      .from('quizzes')
      .select('id, title, creator_id, created_at, language, topic, questions(image_url, order_index)')
      .eq('creator_id', user.id)
      .eq('questions.order_index', 0)
      .then(({ data }) => {
        if (data) setOwnQuizzes(data)
      })
  }, [user])

  // Fetch starred quiz IDs, then fetch their full data
  useEffect(() => {
    if (!user) return
    supabase
      .from('starred_quizzes')
      .select('quiz_id')
      .then(({ data }) => {
        const ids = (data ?? []).map((r) => r.quiz_id)
        if (ids.length === 0) return
        supabase
          .from('quizzes')
          .select('id, title, created_at, language, topic, questions(image_url, order_index)')
          .in('id', ids)
          .eq('questions.order_index', 0)
          .then(({ data: quizData }) => {
            if (quizData) setStarredQuizzes(quizData)
          })
      })
  }, [user])

  // Redirect unauthenticated users to login (after all hooks)
  if (!authLoading && !user) return <Navigate to="/login" replace />

  async function createSession(quizId) {
    const { data, error: err } = await supabase.rpc('create_session', { p_quiz_id: quizId })
    if (err) { setError(err.message); return }
    localStorage.setItem(`host_${data.session_id}`, data.host_secret)
    navigate(`/host?sessionId=${data.session_id}`)
  }

  async function handleDelete(quizId) {
    if (!confirm(t('hostLibrary.deleteConfirm'))) return
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
        .select('id, title, creator_id, created_at, language, topic, questions(image_url, order_index)')
        .eq('creator_id', user.id)
        .eq('questions.order_index', 0)
      if (data) setOwnQuizzes(data)
    } catch (err) {
      setError(err.message)
    }
    setImporting(false)
  }

  async function handleUnstar(quizId) {
    await supabase.from('starred_quizzes').delete().eq('quiz_id', quizId)
    setStarredQuizzes((qs) => qs.filter((q) => q.id !== quizId))
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <div className="flex-1 px-6 py-6 max-w-7xl mx-auto w-full flex flex-col gap-8">
        {error && <p className="text-red-400 text-sm">{error}</p>}

        {/* Create / Import */}
        <div className="flex gap-2">
          <Link
            to='/edit'
            className='flex-1 text-center border-2 border-dashed border-gray-300 hover:border-indigo-500 hover:bg-indigo-50 text-gray-500 hover:text-indigo-500 font-semibold py-3 rounded-xl transition-colors'
          >
            {t('hostLibrary.createNew')}
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
            {importing ? t('hostLibrary.importing') : t('hostLibrary.import')}
          </button>
        </div>

        {/* My Quizzes */}
        {ownQuizzes.length > 0 && (
          <Section title={t('hostLibrary.myQuizzes')}>
            {ownQuizzes.map((quiz) => (
              <QuizCard
                key={quiz.id}
                quiz={quiz}
                isOwn
                user={user}
                t={t}
                onHost={() => createSession(quiz.id)}
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
          <Section title={t('hostLibrary.starred')}>
            {starredQuizzes.map((quiz) => (
              <QuizCard
                key={quiz.id}
                quiz={quiz}
                isOwn={false}
                starred
                user={user}
                t={t}
                onHost={() => createSession(quiz.id)}
                onStar={() => handleUnstar(quiz.id)}
              />
            ))}
          </Section>
        )}
      </div>
    </div>
  )
}
