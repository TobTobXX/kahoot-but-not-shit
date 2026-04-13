import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import QuestionEditor from '../components/QuestionEditor'
import { byOrderIndex } from '../lib/utils'

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

export default function Create() {
  const { quizId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const isEditMode = Boolean(quizId)

  const [title, setTitle] = useState('')
  const [isPublic, setIsPublic] = useState(true)
  const [questions, setQuestions] = useState([blankQuestion()])
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(isEditMode)
  const [authError, setAuthError] = useState(null)
  const [errors, setErrors] = useState({})

  useEffect(() => {
    if (!isEditMode || !quizId) return

    supabase
      .from('quizzes')
      .select('id, title, creator_id, is_public')
      .eq('id', quizId)
      .single()
      .then(({ data, error }) => {
        if (error || !data) {
          setAuthError('Quiz not found.')
          setLoading(false)
          return
        }
        // Belt-and-suspenders ownership check before RLS is tightened in v0.8.
        if (data.creator_id !== user.id) {
          setAuthError('You do not have permission to edit this quiz.')
          setLoading(false)
          return
        }
        setTitle(data.title)
        setIsPublic(data.is_public ?? true)

        supabase
          .from('questions')
          .select('id, order_index, question_text, time_limit, points, image_url, answers(id, order_index, answer_text, is_correct)')
          .eq('quiz_id', quizId)
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
  }, [quizId, isEditMode, user.id])

  function updateQuestion(index, updated) {
    setQuestions((qs) => qs.map((q, i) => (i === index ? updated : q)))
  }

  function deleteQuestion(index) {
    setQuestions((qs) => qs.filter((_, i) => i !== index))
  }

  function addQuestion() {
    setQuestions((qs) => [...qs, blankQuestion()])
  }

  function validate() {
    const errs = {}
    if (!title.trim()) errs.title = 'Quiz title is required'
    questions.forEach((q, i) => {
      if (!q.question_text.trim()) errs[`q${i}_text`] = 'Question text is required'
      const filledAnswers = q.answers.filter((a) => a.answer_text.trim())
      if (filledAnswers.length < 2) errs[`q${i}_answers`] = 'At least 2 answer options required'
      if (!q.answers.some((a) => a.is_correct)) errs[`q${i}_correct`] = 'Mark at least one correct answer'
    })
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function handleCreate() {
    const { data: quiz, error: quizError } = await supabase
      .from('quizzes')
      .insert({ title: title.trim(), is_public: isPublic, creator_id: user.id })
      .select('id')
      .single()

    if (quizError || !quiz) {
      setErrors({ submit: quizError?.message ?? 'Failed to create quiz' })
      setSaving(false)
      return
    }

    const questionInserts = questions.map((q, i) => ({
      quiz_id: quiz.id,
      order_index: i,
      question_text: q.question_text.trim(),
      time_limit: q.time_limit,
      points: q.points,
      image_url: q.image_url.trim() || null,
    }))

    const { data: insertedQuestions, error: qError } = await supabase
      .from('questions')
      .insert(questionInserts)
      .select('id, order_index')

    if (qError || !insertedQuestions) {
      setErrors({ submit: qError?.message ?? 'Failed to save questions' })
      setSaving(false)
      return
    }

    const answerInserts = []
    insertedQuestions.forEach((iq) => {
      const orig = questions[iq.order_index]
      orig.answers.forEach((a, ai) => {
        answerInserts.push({
          question_id: iq.id,
          order_index: ai,
          answer_text: a.answer_text.trim(),
          is_correct: a.is_correct,
        })
      })
    })

    const { error: aError } = await supabase.from('answers').insert(answerInserts)
    if (aError) {
      setErrors({ submit: aError.message ?? 'Failed to save answers' })
      setSaving(false)
      return
    }

    navigate('/host')
  }

  // Edit path: upsert questions/answers one-by-one so we can diff against the DB
  // and issue explicit deletes for rows the user removed. A bulk replace would require
  // cascade deletes + re-inserts, which would break foreign-key references mid-flight.
  async function handleEdit() {
    const { error: quizError } = await supabase
      .from('quizzes')
      .update({ title: title.trim(), is_public: isPublic })
      .eq('id', quizId)
    if (quizError) {
      setErrors({ submit: quizError.message })
      setSaving(false)
      return
    }

    const { data: existingQs, error: fetchErr } = await supabase
      .from('questions')
      .select('id')
      .eq('quiz_id', quizId)
    if (fetchErr) {
      setErrors({ submit: fetchErr.message })
      setSaving(false)
      return
    }
    const existingQIds = new Set(existingQs.map((q) => q.id))

    for (const qid of existingQIds) {
      if (!questions.find((q) => q.id === qid)) {
        await supabase.from('questions').delete().eq('id', qid)
      }
    }

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i]
      const { data: qData, error: qErr } = await supabase
        .from('questions')
        .upsert({
          id: q.id,
          quiz_id: quizId,
          order_index: i,
          question_text: q.question_text.trim(),
          time_limit: q.time_limit,
          points: q.points,
          image_url: q.image_url.trim() || null,
        })
        .select('id')
      if (qErr) {
        setErrors({ submit: qErr.message })
        setSaving(false)
        return
      }

      const newQId = qData[0].id
      const { data: existingAs } = await supabase
        .from('answers')
        .select('id')
        .eq('question_id', newQId)
      const existingAIds = new Set(existingAs.map((a) => a.id))

      for (const aid of existingAIds) {
        if (!q.answers.find((a) => a.id === aid)) {
          await supabase.from('answers').delete().eq('id', aid)
        }
      }

      for (let ai = 0; ai < q.answers.length; ai++) {
        const a = q.answers[ai]
        await supabase.from('answers').upsert({
          id: a.id,
          question_id: newQId,
          order_index: ai,
          answer_text: a.answer_text.trim(),
          is_correct: a.is_correct,
        })
      }
    }

    navigate('/host')
  }

  async function handleSave() {
    if (!validate()) return
    setSaving(true)
    if (isEditMode) await handleEdit()
    else await handleCreate()
  }

  async function handleDelete() {
    if (!confirm('Delete this quiz? This cannot be undone.')) return
    const { error } = await supabase.from('quizzes').delete().eq('id', quizId)
    if (!error) navigate('/library')
    else setErrors({ submit: error.message })
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-slate-400">Loading…</p>
      </div>
    )
  }

  if (authError) {
    return (
      <div className="min-h-screen flex flex-col">
        <div className="flex justify-start px-6 py-4">
          <button
            onClick={() => navigate('/host')}
            className="text-sm text-slate-400 hover:text-white transition-colors"
          >
            &larr; Back
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-red-400">{authError}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-900">
      <div className="flex justify-start px-6 py-4">
        <button
          onClick={() => navigate('/host')}
          className="text-sm text-slate-400 hover:text-white transition-colors"
        >
          &larr; Back
        </button>
      </div>
      <div className="max-w-2xl mx-auto px-4 py-8 flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">{isEditMode ? 'Edit Quiz' : 'Create Quiz'}</h1>
          <button
            type="button"
            onClick={() => navigate(isEditMode ? '/library' : '/host')}
            className="text-slate-400 hover:text-white transition-colors text-sm"
          >
            Cancel
          </button>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm text-slate-400 font-medium">Quiz title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-3 text-white text-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="My awesome quiz"
          />
          {errors.title && <p className="text-red-400 text-sm">{errors.title}</p>}
        </div>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={isPublic}
            onChange={(e) => setIsPublic(e.target.checked)}
            className="w-4 h-4 accent-indigo-500"
          />
          <span className="text-slate-300 text-sm">
            Make this quiz public — anyone can browse and host it
          </span>
        </label>

        <div className="flex flex-col gap-4">
          {questions.map((q, i) => (
            <div key={q.id}>
              <QuestionEditor
                index={i}
                question={q}
                onChange={(updated) => updateQuestion(i, updated)}
                onDelete={() => deleteQuestion(i)}
                canDelete={questions.length > 1}
              />
              {(errors[`q${i}_text`] || errors[`q${i}_answers`] || errors[`q${i}_correct`]) && (
                <div className="mt-1 flex flex-col gap-0.5">
                  {errors[`q${i}_text`] && <p className="text-red-400 text-sm">{errors[`q${i}_text`]}</p>}
                  {errors[`q${i}_answers`] && <p className="text-red-400 text-sm">{errors[`q${i}_answers`]}</p>}
                  {errors[`q${i}_correct`] && <p className="text-red-400 text-sm">{errors[`q${i}_correct`]}</p>}
                </div>
              )}
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={addQuestion}
          className="w-full border-2 border-dashed border-slate-600 hover:border-slate-400 text-slate-400 hover:text-slate-300 rounded-xl py-4 transition-colors font-medium"
        >
          + Add question
        </button>

        {errors.submit && <p className="text-red-400 text-sm">{errors.submit}</p>}

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 rounded-lg transition-colors"
        >
          {saving ? 'Saving…' : isEditMode ? 'Save changes' : 'Save quiz'}
        </button>

        {isEditMode && (
          <button
            type="button"
            onClick={handleDelete}
            className="w-full border border-red-700 hover:border-red-500 text-red-400 hover:text-red-300 font-semibold py-2 rounded-lg transition-colors"
          >
            Delete quiz
          </button>
        )}
      </div>
    </div>
  )
}
