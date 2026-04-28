import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { SLOT_COLORS } from '../lib/slots'
import { useI18n } from '../context/I18nContext'

export default function QuizPreview({ quizId, quizTitle, onClose }) {
  const { t } = useI18n()
  const [questions, setQuestions] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    supabase
      .from('questions')
      .select('*, answers(*)')
      .eq('quiz_id', quizId)
      .order('order_index')
      .order('order_index', { foreignTable: 'answers' })
      .then(({ data, error: err }) => {
        if (err) { console.error(err); setError(err.message); return }
        setQuestions(data ?? [])
      })
  }, [quizId])

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 gap-4 flex-shrink-0">
          <h2 className="font-bold text-gray-900 truncate">{quizTitle}</h2>
          <button
            onClick={onClose}
            title={t('preview.close')}
            className="text-gray-400 hover:text-gray-700 p-1 rounded transition-colors flex-shrink-0"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        </div>

        {/* Scrollable question list */}
        <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-8">
          {error && <p className="text-red-400 text-sm">{error}</p>}
          {!questions && !error && (
            <p className="text-gray-400 text-sm text-center py-8">…</p>
          )}
          {questions?.length === 0 && (
            <p className="text-gray-400 text-sm text-center py-8">{t('preview.noQuestions')}</p>
          )}
          {questions?.map((question, i) => (
            <div key={question.id} className="flex flex-col gap-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                {t('preview.questionNumber').replace('{number}', i + 1)}
              </p>
              {question.image_url && (
                <img
                  src={question.image_url}
                  alt=""
                  className="w-full max-h-48 object-cover rounded-xl"
                />
              )}
              <p className="text-base font-semibold text-gray-900 leading-snug">{question.question_text}</p>
              <div className="grid grid-cols-2 gap-2">
                {question.answers.map((answer, j) => (
                  <div
                    key={answer.id}
                    style={{ backgroundColor: SLOT_COLORS[j] ?? '#888' }}
                    className="rounded-xl px-4 py-3 text-white font-medium text-sm leading-snug"
                  >
                    {answer.answer_text}
                  </div>
                ))}
              </div>
              <div className="flex gap-4 text-xs text-gray-400">
                <span>
                  {question.time_limit
                    ? t('preview.seconds').replace('{seconds}', question.time_limit)
                    : t('preview.noTimeLimit')}
                </span>
                <span>{t('preview.points').replace('{points}', question.points)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
