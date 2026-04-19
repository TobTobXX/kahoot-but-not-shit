import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import QuestionEditor from '../components/QuestionEditor'
import Header from '../components/Header'
import { byOrderIndex } from '../lib/utils'
import { processAndUploadImage } from '../lib/imageUpload'
import { useI18n } from '../context/I18nContext'

// crypto.randomUUID() gives each question a stable client-side ID before it's saved.
// This ID is used as the React key and later as the upsert target when saving.
function blankQuestion() {
  return {
    id: crypto.randomUUID(),
    question_text: '',
    time_limit: 30,
    points: 1000,
    image_url: '',
    answers: [
      { id: crypto.randomUUID(), answer_text: '', is_correct: true },
      { id: crypto.randomUUID(), answer_text: '', is_correct: false },
    ],
  }
}

export default function Edit() {
  const [searchParams] = useSearchParams()
  const urlQuizId = searchParams.get('quizId')
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const { t } = useI18n()

  // effectiveQuizId: null until first save (create mode), then the DB quiz ID.
  // Starts from the URL param so edit mode works on page load.
  const [effectiveQuizId, setEffectiveQuizId] = useState(urlQuizId)
  const effectiveQuizIdRef = useRef(urlQuizId)

  const [title, setTitle] = useState('')
  const [isPublic, setIsPublic] = useState(false)
  const [language, setLanguage] = useState('')
  const [subject, setSubject] = useState('')
  const [questions, setQuestions] = useState([blankQuestion()])
  const isPro = profile?.is_pro ?? false
  const [saveStatus, setSaveStatus] = useState('idle') // 'idle' | 'saving' | 'saved' | 'error'
  const [loading, setLoading] = useState(Boolean(urlQuizId))
  const [authError, setAuthError] = useState(null)
  const [imageErrors, setImageErrors] = useState({})
  const [submitError, setSubmitError] = useState(null)

  const isSavingRef = useRef(false)
  const autoSaveTimerRef = useRef(null)
  const skipReloadRef = useRef(false)

  // Auto-save must NOT fire immediately after loading edit-mode data. We gate on
  // this ref. Create mode starts ready; edit mode starts not ready and becomes ready
  // once loading finishes. The auto-save effect MUST be defined before the effect
  // that sets this ref to true, so React runs auto-save first in the same flush
  // (and still sees false), then the second effect flips it to true.
  const readyForAutoSave = useRef(!urlQuizId)

  // Keep effectiveQuizIdRef in sync so performSave always reads the latest value.
  useEffect(() => {
    effectiveQuizIdRef.current = effectiveQuizId
  }, [effectiveQuizId])

  // Auto-save — debounced 800 ms after any change.
  // Defined BEFORE the readyForAutoSave effect intentionally (see comment above).
  useEffect(() => {
    if (!readyForAutoSave.current) return
    if (!title.trim()) return

    // Capture current values so the timer closure uses them even if state updates later.
    const t = title
    const p = isPublic
    const l = language
    const s = subject
    const q = questions

    clearTimeout(autoSaveTimerRef.current)
    autoSaveTimerRef.current = setTimeout(() => performSave(t, p, l, s, q), 800)

    return () => clearTimeout(autoSaveTimerRef.current)
  }, [title, isPublic, language, subject, questions]) // eslint-disable-line react-hooks/exhaustive-deps

  // Flip readyForAutoSave once initial loading is done.
  // Defined AFTER the auto-save effect so it runs after in the same flush.
  useEffect(() => {
    if (!loading) readyForAutoSave.current = true
  }, [loading])

  // Load quiz data when editing an existing quiz.
  useEffect(() => {
    if (!urlQuizId) return
    if (skipReloadRef.current) return

    supabase
      .from('quizzes')
      .select('id, title, creator_id, is_public, language, subject')
      .eq('id', urlQuizId)
      .single()
      .then(({ data, error }) => {
        if (error || !data) {
          setAuthError(t('edit.quizNotFound'))
          setLoading(false)
          return
        }
        if (data.creator_id !== user.id) {
          setAuthError(t('edit.noPermission'))
          setLoading(false)
          return
        }
        setTitle(data.title)
        setIsPublic(data.is_public ?? false)
        setLanguage(data.language ?? '')
        setSubject(data.subject ?? '')

        supabase
          .from('questions')
          .select('id, order_index, question_text, time_limit, points, image_url, answers(id, order_index, answer_text, is_correct)')
          .eq('quiz_id', urlQuizId)
          .order('order_index')
          .then(({ data: qs, error: qErr }) => {
            if (qErr) {
              setAuthError(qErr.message)
              setLoading(false)
              return
            }
            setQuestions(
              (qs && qs.length > 0 ? qs : [{ id: crypto.randomUUID() }]).map((q) => ({
                id: q.id,
                question_text: q.question_text ?? '',
                time_limit: q.time_limit ?? 30,
                points: q.points ?? 1000,
                image_url: q.image_url ?? '',
                answers: q.answers
                  ? [...q.answers].sort(byOrderIndex).map((a) => ({
                      id: a.id,
                      answer_text: a.answer_text ?? '',
                      is_correct: a.is_correct ?? false,
                    }))
                  : [
                      { id: crypto.randomUUID(), answer_text: '', is_correct: true },
                      { id: crypto.randomUUID(), answer_text: '', is_correct: false },
                    ],
              }))
            )
            setLoading(false)
          })
      })
  }, [urlQuizId, user.id])

  async function handleImageUpload(questionIndex, file) {
    const question = questions[questionIndex]
    try {
      const url = await processAndUploadImage(supabase, file, user.id, question.id)
      updateQuestion(questionIndex, { ...question, image_url: url })
    } catch (err) {
      setImageErrors((prev) => ({ ...prev, [questionIndex]: err.message }))
    }
  }

  function updateQuestion(index, updated) {
    setQuestions((qs) => qs.map((q, i) => (i === index ? updated : q)))
  }

  function deleteQuestion(index) {
    setQuestions((qs) => qs.filter((_, i) => i !== index))
  }

  function addQuestion() {
    setQuestions((qs) => [...qs, blankQuestion()])
  }

  function buildQuestionsPayload(qs) {
    return qs.map((q, i) => ({
      order_index: i,
      question_text: q.question_text.trim(),
      time_limit: q.time_limit,
      points: q.points,
      image_url: q.image_url.trim() || null,
      answers: q.answers.map((a, ai) => ({
        order_index: ai,
        answer_text: a.answer_text.trim(),
        is_correct: a.is_correct,
      })),
    }))
  }

  function buildQuestionsPayloadWithIds(qs) {
    return qs.map((q, i) => ({
      id: q.id,
      order_index: i,
      question_text: q.question_text.trim(),
      time_limit: q.time_limit,
      points: q.points,
      image_url: q.image_url.trim() || null,
      answers: q.answers.map((a, ai) => ({
        id: a.id,
        order_index: ai,
        answer_text: a.answer_text.trim(),
        is_correct: a.is_correct,
      })),
    }))
  }

  async function performSave(currentTitle, currentIsPublic, currentLanguage, currentSubject, currentQuestions) {
    if (!currentTitle.trim()) return false
    if (isSavingRef.current) return false
    isSavingRef.current = true
    setSaveStatus('saving')
    setSubmitError(null)

    const quizIdToUse = effectiveQuizIdRef.current

    try {
      if (!quizIdToUse) {
        // Create mode: create the full quiz in one RPC call.
        const { data: newId, error } = await supabase.rpc('save_quiz', {
          p_title: currentTitle.trim(),
          p_is_public: currentIsPublic,
          p_language: currentLanguage.trim() || null,
          p_subject: currentSubject.trim() || null,
          p_questions: buildQuestionsPayload(currentQuestions),
        })
        if (error) throw new Error(error.message)

        // Update URL to edit mode without re-triggering the data load effect.
        skipReloadRef.current = true
        effectiveQuizIdRef.current = newId
        setEffectiveQuizId(newId)
        navigate(`/edit?quizId=${newId}`, { replace: true })
      } else {
        // Edit mode: single RPC call replaces all questions and answers atomically.
        const { error } = await supabase.rpc('update_quiz', {
          p_quiz_id: quizIdToUse,
          p_title: currentTitle.trim(),
          p_is_public: currentIsPublic,
          p_language: currentLanguage.trim() || null,
          p_subject: currentSubject.trim() || null,
          p_questions: buildQuestionsPayloadWithIds(currentQuestions),
        })
        if (error) throw new Error(error.message)
      }

      setSaveStatus('saved')
      setTimeout(() => setSaveStatus((s) => (s === 'saved' ? 'idle' : s)), 2000)
      return true
    } catch (err) {
      console.error('[save] Error:', err.message)
      setSubmitError(err.message)
      setSaveStatus('error')
      return false
    } finally {
      isSavingRef.current = false
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">{t('edit.loading')}</p>
      </div>
    )
  }

  if (authError) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center">
          <p className="text-red-400">{authError}</p>
        </div>
      </div>
    )
  }

  const isEditMode = Boolean(effectiveQuizId)
  const titleEmpty = !title.trim()

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <div className="max-w-2xl mx-auto px-4 py-8 flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">{isEditMode ? t('edit.editQuiz') : t('edit.createQuiz')}</h1>
          <button
            type="button"
            onClick={async () => {
              clearTimeout(autoSaveTimerRef.current)
              await performSave(title, isPublic, language, subject, questions)
              navigate('/library')
            }}
            className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-4 py-1.5 rounded-lg transition-colors text-sm"
          >
            {t('edit.saveAndGoBack')}
          </button>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm text-gray-500 font-medium">{t('edit.quizTitle')}</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={`w-full bg-white border rounded-lg px-4 py-3 text-gray-900 text-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
              titleEmpty ? 'border-red-400' : 'border-gray-300'
            }`}
            placeholder={t('edit.quizTitlePlaceholder')}
          />
        </div>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={isPublic}
            onChange={(e) => setIsPublic(e.target.checked)}
            className="w-4 h-4 accent-indigo-500"
          />
          <span className="text-gray-600 text-sm">
            {t('edit.makePublic')}
          </span>
        </label>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm text-gray-500 font-medium">{t('edit.language')}</label>
            <input
              type="text"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder={t('edit.languagePlaceholder')}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm text-gray-500 font-medium">{t('edit.subject')}</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder={t('edit.subjectPlaceholder')}
            />
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {questions.map((q, i) => (
            <div key={q.id}>
              <QuestionEditor
                index={i}
                question={q}
                onChange={(updated) => updateQuestion(i, updated)}
                onDelete={() => deleteQuestion(i)}
                canDelete={questions.length > 1}
                isPro={isPro}
                onImageUpload={(file) => handleImageUpload(i, file)}
              />
              {imageErrors[i] && (
                <p className="mt-1 text-red-400 text-sm">{t('edit.imageUploadFailed', { error: imageErrors[i] })}</p>
              )}
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={addQuestion}
          className="w-full border-2 border-dashed border-gray-300 hover:border-gray-400 text-gray-500 hover:text-gray-700 rounded-xl py-4 transition-colors font-medium"
        >
          {t('edit.addQuestion')}
        </button>

        {submitError && <p className="text-red-400 text-sm">{submitError}</p>}

        <button
          type="button"
          onClick={async () => {
            clearTimeout(autoSaveTimerRef.current)
            const ok = await performSave(title, isPublic, language, subject, questions)
            if (ok) navigate('/library')
          }}
          disabled={saveStatus === 'saving' || titleEmpty}
          className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 rounded-lg transition-colors"
        >
          {saveStatus === 'saving'
            ? t('edit.saving')
            : saveStatus === 'saved'
            ? t('edit.saved')
            : isEditMode
            ? t('edit.saveChanges')
            : t('edit.saveQuiz')}
        </button>
      </div>
    </div>
  )
}
