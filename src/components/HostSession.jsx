import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import SlotIcon from './SlotIcon'
import { SLOT_COLOR_HEX } from '../lib/slots'
import { byOrderIndex } from '../lib/utils'

// Shown at /host/:sessionId. Manages the live game: waiting room, active
// question display, and the finished state.
export default function HostSession({ sessionId }) {
  const [joinCode, setJoinCode] = useState(null)
  const [quizId, setQuizId] = useState(null)
  const [sessionState, setSessionState] = useState('waiting')
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [totalQuestions, setTotalQuestions] = useState(0)
  const [playerCount, setPlayerCount] = useState(0)
  const [questionOpen, setQuestionOpen] = useState(true)
  const [answerCount, setAnswerCount] = useState(0)
  const [currentQuestionSlots, setCurrentQuestionSlots] = useState(null)
  const [shuffleAnswers, setShuffleAnswers] = useState(false)
  const [hostQuestions, setHostQuestions] = useState([])
  const [timeRemaining, setTimeRemaining] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadingSlots, setLoadingSlots] = useState(false)
  const answersChannelRef = useRef(null)

  // Load session on mount
  useEffect(() => {
    supabase
      .from('sessions')
      .select('id, join_code, state, current_question_index, quiz_id, question_open')
      .eq('id', sessionId)
      .single()
      .then(({ data, error: err }) => {
        if (err) {
          setError('Session not found')
          setLoading(false)
          return
        }
        setJoinCode(data.join_code)
        setSessionState(data.state)
        setCurrentQuestionIndex(data.current_question_index ?? 0)
        setQuizId(data.quiz_id)
        setQuestionOpen(data.question_open ?? true)

        if (data.state === 'active') {
          supabase
            .from('questions')
            .select('id, question_text, time_limit, points, answers(id, answer_text, order_index, is_correct)')
            .eq('quiz_id', data.quiz_id)
            .order('order_index')
            .then(({ data: qs }) => {
              if (qs) {
                setHostQuestions(qs.map((q) => ({ ...q, answers: [...q.answers].sort(byOrderIndex) })))
              }
            })
        }

        setLoading(false)

        supabase
          .from('players')
          .select('id', { count: 'exact', head: true })
          .eq('session_id', data.id)
          .then(({ count }) => {
            if (count != null) setPlayerCount(count)
          })
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- sessionId intentionally only read on mount

  // Fetch total question count when quizId becomes known
  useEffect(() => {
    if (!quizId) return
    supabase
      .from('questions')
      .select('id', { count: 'exact', head: true })
      .eq('quiz_id', quizId)
      .then(({ count, error: err }) => {
        if (err) setError(err.message)
        else setTotalQuestions(count)
      })
  }, [quizId])

  // Realtime: session state changes + player joins
  useEffect(() => {
    const sessionChannel = supabase
      .channel(`host-session-${sessionId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'sessions', filter: `id=eq.${sessionId}` },
        (payload) => {
          setSessionState(payload.new.state)
          setCurrentQuestionIndex(payload.new.current_question_index)
          setQuestionOpen(payload.new.question_open ?? true)
          setCurrentQuestionSlots(payload.new.current_question_slots ?? null)
        }
      )
      .subscribe()

    const playersChannel = supabase
      .channel(`players-${sessionId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'players', filter: `session_id=eq.${sessionId}` },
        () => setPlayerCount((c) => c + 1)
      )
      .subscribe()

    return () => {
      supabase.removeChannel(sessionChannel)
      supabase.removeChannel(playersChannel)
    }
  }, [sessionId])

  // Realtime: re-subscribe to player_answers whenever the current question changes
  useEffect(() => {
    if (!quizId || sessionState !== 'active') return

    // hostQuestions may not be loaded yet; fall back to a DB query for the question id
    const questionId = hostQuestions[currentQuestionIndex]?.id
    if (!questionId) {
      supabase
        .from('questions')
        .select('id')
        .eq('quiz_id', quizId)
        .order('order_index')
        .then(({ data: qs }) => {
          const qid = qs?.[currentQuestionIndex]?.id
          if (!qid) return
          subscribeToAnswers(qid)
        })
    } else {
      subscribeToAnswers(questionId)
    }

    function subscribeToAnswers(qid) {
      if (answersChannelRef.current) {
        supabase.removeChannel(answersChannelRef.current)
      }
      const ch = supabase
        .channel(`answers-${sessionId}-${qid}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'player_answers', filter: `question_id=eq.${qid}` },
          () => setAnswerCount((c) => c + 1)
        )
        .subscribe()
      answersChannelRef.current = ch
    }

    return () => {
      if (answersChannelRef.current) {
        supabase.removeChannel(answersChannelRef.current)
        answersChannelRef.current = null
      }
    }
  }, [sessionId, quizId, currentQuestionIndex, sessionState]) // eslint-disable-line react-hooks/exhaustive-deps

  // Countdown timer — resets when a new question opens
  useEffect(() => {
    if (!questionOpen || sessionState !== 'active') {
      setTimeRemaining(null)
      return
    }
    const question = hostQuestions[currentQuestionIndex]
    if (!question) return
    setTimeRemaining(question.time_limit ?? 30)
    const interval = setInterval(() => {
      setTimeRemaining((t) => {
        if (t === null || t <= 0) { clearInterval(interval); return 0 }
        return t - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [questionOpen, currentQuestionIndex, sessionState, hostQuestions])

  async function startGame() {
    const { count, error: countError } = await supabase
      .from('questions')
      .select('id', { count: 'exact', head: true })
      .eq('quiz_id', quizId)
    if (countError) { setError(countError.message); return }

    const { error: startError } = await supabase
      .from('sessions')
      .update({ state: 'active', current_question_index: 0 })
      .eq('id', sessionId)
    if (startError) { setError(startError.message); return }

    const { data: qs } = await supabase
      .from('questions')
      .select('id, question_text, time_limit, points, answers(id, answer_text, order_index, is_correct)')
      .eq('quiz_id', quizId)
      .order('order_index')
    const sortedQs = qs ? qs.map((q) => ({ ...q, answers: [...q.answers].sort(byOrderIndex) })) : []
    const firstQuestionId = sortedQs[0]?.id
    if (!firstQuestionId) { setError('No questions found'); return }

    setLoadingSlots(true)
    const { data: slots, error: slotsError } = await supabase.rpc('assign_answer_slots', {
      p_session_id: sessionId,
      p_question_id: firstQuestionId,
      p_shuffle: shuffleAnswers,
    })
    setLoadingSlots(false)
    if (slotsError) { setError(slotsError.message); return }

    const { error: updateError } = await supabase
      .from('sessions')
      .update({ current_question_slots: slots })
      .eq('id', sessionId)
    if (updateError) { setError(updateError.message); return }

    setCurrentQuestionSlots(slots)
    setHostQuestions(sortedQs)
    setTotalQuestions(count)
    setAnswerCount(0)
  }

  async function nextQuestion() {
    const next = currentQuestionIndex + 1
    const nextQuestionId = hostQuestions[next]?.id
    if (!nextQuestionId) return

    setLoadingSlots(true)
    const { data: slots, error: slotsError } = await supabase.rpc('assign_answer_slots', {
      p_session_id: sessionId,
      p_question_id: nextQuestionId,
      p_shuffle: shuffleAnswers,
    })
    setLoadingSlots(false)
    if (slotsError) { setError(slotsError.message); return }

    const { error } = await supabase
      .from('sessions')
      .update({ current_question_index: next, question_open: true, current_question_slots: slots })
      .eq('id', sessionId)
    if (error) { setError(error.message); return }

    setCurrentQuestionSlots(slots)
    setAnswerCount(0)
  }

  async function closeQuestion() {
    if (!questionOpen) return
    const { error } = await supabase
      .from('sessions')
      .update({ question_open: false })
      .eq('id', sessionId)
    if (error) setError(error.message)
  }

  async function endGame() {
    const { error } = await supabase
      .from('sessions')
      .update({ state: 'finished' })
      .eq('id', sessionId)
    if (error) setError(error.message)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-slate-400">Loading…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4">
      <h1 className="text-3xl font-bold mb-8">Host</h1>
      {error && <p className="text-red-400 mb-4">{error}</p>}

      <div className="w-full max-w-sm bg-slate-800 rounded-2xl shadow-xl p-8 flex flex-col items-center gap-6">
        <div className="text-center">
          <p className="text-sm text-slate-400 mb-1">Join code</p>
          <p className="text-6xl font-bold tracking-widest">{joinCode}</p>
        </div>

        {sessionState === 'waiting' && (
          <div className="flex flex-col items-center gap-4 w-full">
            <div className="flex items-center gap-2 text-slate-400">
              <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
              <span className="text-sm">{playerCount} player(s) joined</span>
            </div>
            <label className="flex items-center gap-2 text-slate-300 text-sm cursor-pointer select-none">
              <input
                type="checkbox"
                checked={shuffleAnswers}
                onChange={(e) => setShuffleAnswers(e.target.checked)}
                className="w-4 h-4 accent-indigo-500"
              />
              Shuffle answer positions
            </label>
            <button
              onClick={startGame}
              disabled={loadingSlots}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 rounded-lg transition-colors"
            >
              {loadingSlots ? 'Starting…' : `Start game (${playerCount} players)`}
            </button>
          </div>
        )}

        {sessionState === 'active' && (
          <div className="flex flex-col items-center gap-4 w-full">
            <p className="text-slate-300 text-sm">
              Question <span className="text-white font-bold">{currentQuestionIndex + 1}</span> / {totalQuestions}
            </p>

            {hostQuestions[currentQuestionIndex] && (
              <p className="text-2xl font-bold text-center leading-snug px-2">
                {hostQuestions[currentQuestionIndex].question_text}
              </p>
            )}

            {timeRemaining !== null && (
              <div className="text-6xl font-bold text-white tabular-nums">
                {timeRemaining}
              </div>
            )}

            {currentQuestionSlots && (
              <div className="w-full grid grid-cols-2 gap-3">
                {currentQuestionSlots.map((slot) => {
                  const answer = hostQuestions[currentQuestionIndex]?.answers?.find((a) => a.id === slot.answer_id)
                  return (
                    <div
                      key={slot.slot_index}
                      className="flex items-center gap-3 p-3 rounded-xl min-h-20"
                      style={{ backgroundColor: SLOT_COLOR_HEX[slot.color] }}
                    >
                      <SlotIcon name={slot.icon} className="text-white flex-shrink-0" />
                      <span className="text-white font-semibold text-center flex-1 leading-tight">
                        {answer?.answer_text ?? ''}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}

            <p className="text-slate-400 text-sm">
              {questionOpen
                ? `${answerCount} / ${playerCount} answered`
                : 'Results shown'}
            </p>
            <button
              onClick={closeQuestion}
              disabled={!questionOpen}
              className="w-full bg-amber-600 hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-3 rounded-lg transition-colors"
            >
              Close question
            </button>
            <button
              onClick={nextQuestion}
              disabled={currentQuestionIndex >= totalQuestions - 1 || loadingSlots}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-3 rounded-lg transition-colors"
            >
              {loadingSlots ? 'Loading…' : 'Next question'}
            </button>
            <button
              onClick={endGame}
              className="w-full bg-slate-600 hover:bg-slate-500 text-white font-semibold py-2 rounded-lg transition-colors"
            >
              End game
            </button>
          </div>
        )}

        {sessionState === 'finished' && (
          <p className="text-2xl font-bold">Game over.</p>
        )}
      </div>
    </div>
  )
}
