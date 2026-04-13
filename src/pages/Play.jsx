import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const ANSWER_COLOURS = [
  'bg-rose-500',
  'bg-blue-500',
  'bg-amber-400',
  'bg-emerald-500',
]

export default function Play() {
  const { code } = useParams()
  const [nickname, setNickname] = useState(null)
  const [sessionState, setSessionState] = useState(null)
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(null)
  const [questions, setQuestions] = useState([])
  const [selectedAnswerId, setSelectedAnswerId] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function load() {
      const { data: session, error: sessionError } = await supabase
        .from('sessions')
        .select('id, state, current_question_index, quiz_id')
        .eq('join_code', code)
        .single()

      if (sessionError || !session) {
        setError('Session not found')
        return
      }

      const playerId = localStorage.getItem('player_id')
      if (!playerId) {
        setError('Player not found — did you join via the home page?')
        return
      }

      const { data: player, error: playerError } = await supabase
        .from('players')
        .select('nickname')
        .eq('id', playerId)
        .single()

      if (playerError || !player) {
        setError('Could not load player info')
        return
      }

      setNickname(player.nickname)
      setSessionState(session.state)
      setCurrentQuestionIndex(session.current_question_index)

      if (session.state === 'active') {
        const { data: qs, error: qsError } = await supabase
          .from('questions')
          .select('id, question_text, order_index, answers(id, answer_text, is_correct, order_index)')
          .eq('quiz_id', session.quiz_id)
          .order('order_index')

        if (qsError) { setError(qsError.message); return }

        const sorted = qs.map((q) => ({
          ...q,
          answers: [...q.answers].sort((a, b) => a.order_index - b.order_index),
        }))
        setQuestions(sorted)
      }
    }

    load()
  }, [code])

  // Section 8 — loading and error (before nickname is known)
  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4">
        <p className="text-red-400 text-2xl font-bold mb-2">Error</p>
        <p className="text-slate-300">{error}</p>
      </div>
    )
  }

  if (!nickname) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-4 border-white border-t-transparent animate-spin" />
      </div>
    )
  }

  // Section 3 — shared shell
  const question = sessionState === 'active' &&
    currentQuestionIndex !== null &&
    currentQuestionIndex < questions.length
    ? questions[currentQuestionIndex]
    : null

  function handleAnswer(answer) {
    if (selectedAnswerId !== null) return
    setSelectedAnswerId(answer.id)
  }

  function answerClassName(answer) {
    const base = 'min-h-20 rounded-xl text-white font-semibold text-lg flex items-center justify-center text-center px-4 transition-opacity'
    if (selectedAnswerId === null) {
      return `${base} ${ANSWER_COLOURS[answer.order_index]}`
    }
    if (answer.id === selectedAnswerId) {
      const feedbackColour = answer.is_correct ? 'bg-emerald-600' : 'bg-red-600'
      return `${base} ${feedbackColour} ring-4 ring-white`
    }
    return `${base} ${ANSWER_COLOURS[answer.order_index]} opacity-40 cursor-not-allowed`
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top bar */}
      <div className="px-4 py-3 border-b border-slate-700">
        <p className="text-sm text-slate-400">
          Playing as <strong className="text-white">{nickname}</strong>
        </p>
      </div>

      {/* Inner content */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8">

        {/* Section 4 — waiting */}
        {sessionState === 'waiting' && (
          <div className="flex flex-col items-center gap-4">
            <p className="text-2xl font-semibold text-center">Waiting for the host to start…</p>
            <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
          </div>
        )}

        {/* Section 7 — game over */}
        {sessionState === 'finished' && (
          <div className="flex flex-col items-center gap-2 text-center">
            <p className="text-4xl font-bold">Game over</p>
            <p className="text-slate-300 text-lg">Thanks for playing, <strong>{nickname}</strong>!</p>
          </div>
        )}

        {/* Section 7 — waiting to end (active but past last question) */}
        {sessionState === 'active' && !question && (
          <div className="flex flex-col items-center gap-4">
            <p className="text-2xl font-semibold text-center">Waiting for the game to end…</p>
            <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
          </div>
        )}

        {/* Sections 5 & 6 — question and answers */}
        {question && (
          <div className="w-full max-w-xl flex flex-col gap-6">
            <p className="text-2xl font-bold text-center leading-snug px-2">
              {question.question_text}
            </p>
            <div className={`grid gap-3 ${question.answers.length === 2 ? 'grid-cols-1' : 'grid-cols-2'}`}>
              {question.answers.map((answer) => (
                <button
                  key={answer.id}
                  onClick={() => handleAnswer(answer)}
                  disabled={selectedAnswerId !== null}
                  className={answerClassName(answer)}
                >
                  {answer.answer_text}
                </button>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
