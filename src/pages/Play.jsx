import { useEffect, useRef, useState } from 'react'
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
  const [sessionId, setSessionId] = useState(null)
  const [sessionState, setSessionState] = useState(null)
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(null)
  const [questions, setQuestions] = useState([])
  const [submittedAnswerId, setSubmittedAnswerId] = useState(null)
  const [answerSubmitted, setAnswerSubmitted] = useState(false)
  const [alreadyAnswered, setAlreadyAnswered] = useState(false)
  const [feedbackShown, setFeedbackShown] = useState(false)
  const [isCorrect, setIsCorrect] = useState(null)
  const [pointsEarned, setPointsEarned] = useState(0)
  const [correctAnswerIds, setCorrectAnswerIds] = useState([])
  const [leaderboard, setLeaderboard] = useState([])
  const [error, setError] = useState(null)

  const wasActiveRef = useRef(false)
  const sessionIdRef = useRef(null)
  const questionsRef = useRef([])
  const prevQuestionIndexRef = useRef(null)

  // Keep refs in sync so async callbacks always see current values
  useEffect(() => { questionsRef.current = questions }, [questions])
  useEffect(() => { sessionIdRef.current = sessionId }, [sessionId])

  async function loadFeedback(closedQuestion, sid, pid) {
    setFeedbackShown(true)
    if (closedQuestion && pid) {
      const { data: pa } = await supabase
        .from('player_answers')
        .select('answer_id, points_earned, answers(is_correct)')
        .eq('player_id', pid)
        .eq('question_id', closedQuestion.id)
        .maybeSingle()
      const correct = pa?.answers?.is_correct ?? false
      setSubmittedAnswerId(pa?.answer_id ?? null)
      setAnswerSubmitted(!!pa)
      setIsCorrect(pa ? correct : null)
      setPointsEarned(pa?.points_earned ?? 0)

      const { data: correctAnswers } = await supabase
        .from('answers')
        .select('id')
        .eq('question_id', closedQuestion.id)
        .eq('is_correct', true)
      setCorrectAnswerIds(correctAnswers ? correctAnswers.map((a) => a.id) : [])
    }
    if (sid) {
      const { data: lb } = await supabase
        .from('players')
        .select('id, nickname, score')
        .eq('session_id', sid)
        .order('score', { ascending: false })
        .order('nickname')
      if (lb) setLeaderboard(lb)
    }
  }

  useEffect(() => {
    async function load() {
      const { data: session, error: sessionError } = await supabase
        .from('sessions')
        .select('id, state, current_question_index, quiz_id, question_open')
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
      setSessionId(session.id)
      sessionIdRef.current = session.id
      prevQuestionIndexRef.current = session.current_question_index

      const quizId = session.quiz_id

      if (session.state === 'active') {
        wasActiveRef.current = true
        const { data: qs, error: qsError } = await supabase
          .from('questions')
          .select('id, question_text, order_index, points, answers(id, answer_text, order_index)')
          .eq('quiz_id', quizId)
          .order('order_index')

        if (qsError) { setError(qsError.message); return }

        const sorted = qs.map((q) => ({
          ...q,
          answers: [...q.answers].sort((a, b) => a.order_index - b.order_index),
        }))
        setQuestions(sorted)
        questionsRef.current = sorted

        const currentQuestion = sorted[session.current_question_index]
        if (currentQuestion) {
          if (!session.question_open) {
            // Feedback phase: restore full feedback state
            await loadFeedback(currentQuestion, session.id, playerId)
          } else {
            // Question open: restore submitted answer if player already answered
            const { data: pa } = await supabase
              .from('player_answers')
              .select('answer_id')
              .eq('player_id', playerId)
              .eq('question_id', currentQuestion.id)
              .maybeSingle()
            if (pa) {
              setSubmittedAnswerId(pa.answer_id)
              setAnswerSubmitted(true)
            }
          }
        }
      }

      channel = supabase
        .channel(`player-session-${code}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'sessions', filter: `join_code=eq.${code}` },
          (payload) => {
            const newState = payload.new.state
            const newIndex = payload.new.current_question_index
            const newQuestionOpen = payload.new.question_open

            setSessionState(newState)
            setCurrentQuestionIndex(newIndex)

            // Reset answer state when question index changes
            if (newIndex !== prevQuestionIndexRef.current) {
              prevQuestionIndexRef.current = newIndex
              setSubmittedAnswerId(null)
              setAnswerSubmitted(false)
              setAlreadyAnswered(false)
              setFeedbackShown(false)
              setIsCorrect(null)
              setPointsEarned(0)
              setCorrectAnswerIds([])
            }

            if (!wasActiveRef.current && newState === 'active') {
              wasActiveRef.current = true
              supabase
                .from('questions')
                .select('id, question_text, order_index, points, answers(id, answer_text, order_index)')
                .eq('quiz_id', quizId)
                .order('order_index')
                .then(({ data, error }) => {
                  if (error) { setError(error.message); return }
                  const sorted = data.map((q) => ({
                    ...q,
                    answers: [...q.answers].sort((a, b) => a.order_index - b.order_index),
                  }))
                  setQuestions(sorted)
                  questionsRef.current = sorted
                })
              return
            }

            // Detect question_open transition: true → false (host closed the question)
            if (wasActiveRef.current && newQuestionOpen === false) {
              const oldIndex = payload.old.current_question_index ?? newIndex
              const closedQuestion = questionsRef.current[oldIndex]
              const sid = sessionIdRef.current
              const pid = localStorage.getItem('player_id')
              loadFeedback(closedQuestion, sid, pid)
            }
          }
        )
        .subscribe()

    }

    let channel = null
    load()

    return () => {
      if (channel) supabase.removeChannel(channel)
    }
  }, [code])

  async function submitAnswer(answer) {
    if (answerSubmitted || alreadyAnswered) return

    const playerId = localStorage.getItem('player_id')
    const question = questionsRef.current[currentQuestionIndex]
    if (!playerId || !question) return

    setSubmittedAnswerId(answer.id)

    const { error } = await supabase
      .rpc('submit_answer', { p_player_id: playerId, p_question_id: question.id, p_answer_id: answer.id })

    if (error) {
      if (error.code === '23505') {
        setAlreadyAnswered(true)
      } else {
        setError(error.message)
      }
      return
    }

    setAnswerSubmitted(true)
  }

  function answerClassName(answer) {
    const base = 'min-h-20 rounded-xl text-white font-semibold text-lg flex items-center justify-center text-center px-4 transition-opacity'

    if (feedbackShown) {
      if (correctAnswerIds.includes(answer.id)) {
        return `${base} bg-emerald-600 ring-4 ring-white`
      }
      if (answer.id === submittedAnswerId) {
        return `${base} bg-red-600 ring-4 ring-white`
      }
      return `${base} ${ANSWER_COLOURS[answer.order_index]} opacity-40`
    }

    if (submittedAnswerId === null) {
      return `${base} ${ANSWER_COLOURS[answer.order_index]}`
    }
    if (answer.id === submittedAnswerId) {
      return `${base} ${ANSWER_COLOURS[answer.order_index]} ring-4 ring-white`
    }
    return `${base} ${ANSWER_COLOURS[answer.order_index]} opacity-40 cursor-not-allowed`
  }

  // Loading / error states
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

  const playerId = localStorage.getItem('player_id')
  const question = sessionState === 'active' &&
    currentQuestionIndex !== null &&
    currentQuestionIndex < questions.length
    ? questions[currentQuestionIndex]
    : null

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

        {/* Waiting */}
        {sessionState === 'waiting' && (
          <div className="flex flex-col items-center gap-4">
            <p className="text-2xl font-semibold text-center">Waiting for the host to start…</p>
            <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
          </div>
        )}

        {/* Game over */}
        {sessionState === 'finished' && (
          <div className="flex flex-col items-center gap-2 text-center">
            <p className="text-4xl font-bold">Game over</p>
            <p className="text-slate-300 text-lg">Thanks for playing, <strong>{nickname}</strong>!</p>
          </div>
        )}

        {/* Active but past last question */}
        {sessionState === 'active' && !question && !feedbackShown && (
          <div className="flex flex-col items-center gap-4">
            <p className="text-2xl font-semibold text-center">Waiting for the game to end…</p>
            <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
          </div>
        )}

        {/* Leaderboard view (replaces question when feedback is shown) */}
        {question && feedbackShown && (
          <div className="w-full max-w-xl flex flex-col gap-4">
            {/* Result banner */}
            {isCorrect !== null && (
              <div className={`rounded-xl px-6 py-4 text-center font-bold text-xl ${isCorrect ? 'bg-emerald-600' : 'bg-red-600'}`}>
                {isCorrect ? `Correct! +${pointsEarned} points` : 'Wrong'}
              </div>
            )}
            {isCorrect === null && (
              <div className="rounded-xl px-6 py-4 text-center font-bold text-xl bg-slate-700">
                You didn't answer
              </div>
            )}

            {/* Leaderboard */}
            <div className="flex flex-col gap-2">
              {leaderboard.map((p, i) => (
                <div
                  key={p.id}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg ${p.id === playerId ? 'bg-indigo-700' : 'bg-slate-800'}`}
                >
                  <span className="text-slate-400 font-mono w-6 text-right">{i + 1}</span>
                  <span className="flex-1 font-semibold">{p.nickname}</span>
                  <span className="text-slate-300">{p.score}</span>
                </div>
              ))}
            </div>

            <p className="text-slate-400 text-sm text-center">Waiting for next question…</p>
          </div>
        )}

        {/* Question and answers */}
        {question && !feedbackShown && (
          <div className="w-full max-w-xl flex flex-col gap-6">
            <p className="text-2xl font-bold text-center leading-snug px-2">
              {question.question_text}
            </p>
            <div className={`grid gap-3 ${question.answers.length === 2 ? 'grid-cols-1' : 'grid-cols-2'}`}>
              {question.answers.map((answer) => (
                <button
                  key={answer.id}
                  onClick={() => submitAnswer(answer)}
                  disabled={answerSubmitted || alreadyAnswered}
                  className={answerClassName(answer)}
                >
                  {answer.answer_text}
                </button>
              ))}
            </div>
            {answerSubmitted && (
              <p className="text-center text-slate-300 text-sm">Answer submitted</p>
            )}
            {alreadyAnswered && (
              <p className="text-center text-slate-400 text-sm">You already answered this question</p>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
