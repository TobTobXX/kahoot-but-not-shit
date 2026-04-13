import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

function SlotIcon({ name, className }) {
  const size = 40
  const fill = 'currentColor'
  if (name === 'circle') {
    return <svg width={size} height={size} viewBox="0 0 40 40" className={className}><circle cx="20" cy="20" r="18" fill={fill} /></svg>
  }
  if (name === 'diamond') {
    return <svg width={size} height={size} viewBox="0 0 40 40" className={className}><rect x="6" y="6" width="20" height="20" transform="rotate(45 16 16)" fill={fill} /></svg>
  }
  if (name === 'triangle') {
    return <svg width={size} height={size} viewBox="0 0 40 40" className={className}><polygon points="20,4 38,36 2,36" fill={fill} /></svg>
  }
  if (name === 'square') {
    return <svg width={size} height={size} viewBox="0 0 40 40" className={className}><rect width="36" height="36" x="2" y="2" rx="2" fill={fill} /></svg>
  }
  return null
}

const SLOT_COLORS = {
  red:    '#FF4949',
  blue:   '#2D7DD2',
  yellow: '#FFD60A',
  green:  '#2ECC71',
}

function generateJoinCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

export default function Host() {
  const { sessionId: urlSessionId } = useParams()
  const navigate = useNavigate()
  const [quizzes, setQuizzes] = useState([])
  const [joinCode, setJoinCode] = useState(null)
  const [sessionId, setSessionId] = useState(null)
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

  useEffect(() => {
    if (urlSessionId) {
      supabase
        .from('sessions')
        .select('id, join_code, state, current_question_index, quiz_id, question_open')
        .eq('id', urlSessionId)
        .single()
        .then(({ data, error }) => {
          if (error) {
            setError('Session not found')
            setLoading(false)
            return
          }
          setJoinCode(data.join_code)
          setSessionId(data.id)
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
                  const sortedQs = qs.map((q) => ({ ...q, answers: [...q.answers].sort((a, b) => a.order_index - b.order_index) }))
                  setHostQuestions(sortedQs)
                }
              })
          }
          setLoading(false)
          supabase
            .from('players')
            .select('*')
            .eq('session_id', data.id)
            .order('joined_at')
            .then(({ data: existingPlayers }) => {
              if (existingPlayers) {
                setPlayerCount(existingPlayers.length)
              }
            })
        })
    } else {
      supabase
        .from('quizzes')
        .select('id, title')
        .then(({ data, error }) => {
          if (error) setError(error.message)
          else setQuizzes(data)
          setLoading(false)
        })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- urlSessionId intentionally only read on mount

  useEffect(() => {
    if (!quizId) return
    supabase
      .from('questions')
      .select('id', { count: 'exact', head: true })
      .eq('quiz_id', quizId)
      .then(({ count, error }) => {
        if (error) setError(error.message)
        else setTotalQuestions(count)
      })
  }, [quizId])

  useEffect(() => {
    if (!sessionId) return

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
        () => {
          setPlayerCount((c) => c + 1)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(sessionChannel)
      supabase.removeChannel(playersChannel)
    }
  }, [sessionId])

  // Re-subscribe to player_answers whenever the current question changes
  useEffect(() => {
    if (!sessionId || sessionState !== 'active') return

    // We need the question id for the current index — fetch it first
    supabase
      .from('questions')
      .select('id')
      .eq('quiz_id', quizId)
      .order('order_index')
      .then(({ data: qs }) => {
        if (!qs || !qs[currentQuestionIndex]) return
        const questionId = qs[currentQuestionIndex].id

        if (answersChannelRef.current) {
          supabase.removeChannel(answersChannelRef.current)
        }

        const ch = supabase
          .channel(`answers-${sessionId}`)
          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'player_answers', filter: `question_id=eq.${questionId}` },
            () => { setAnswerCount((c) => c + 1) }
          )
          .subscribe()
        answersChannelRef.current = ch
      })

    return () => {
      if (answersChannelRef.current) {
        supabase.removeChannel(answersChannelRef.current)
        answersChannelRef.current = null
      }
    }
  }, [sessionId, currentQuestionIndex, sessionState]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!questionOpen || sessionState !== 'active') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional reset on close
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

  async function createSession(selectedQuizId) {
    const code = generateJoinCode()
    const { data, error } = await supabase
      .from('sessions')
      .insert({ quiz_id: selectedQuizId, join_code: code, state: 'waiting' })
      .select('id')
      .single()
    if (error) {
      setError(error.message)
    } else {
      setJoinCode(code)
      setSessionId(data.id)
      setQuizId(selectedQuizId)
      navigate(`/host/${data.id}`)
    }
  }

  async function startGame() {
    const { count, error: countError } = await supabase
      .from('questions')
      .select('id', { count: 'exact', head: true })
      .eq('quiz_id', quizId)
    if (countError) { setError(countError.message); return }

    const { error } = await supabase
      .from('sessions')
      .update({ state: 'active', current_question_index: 0 })
      .eq('id', sessionId)
    if (error) { setError(error.message); return }

    const { data: qs } = await supabase
      .from('questions')
      .select('id, question_text, time_limit, points, answers(id, answer_text, order_index, is_correct)')
      .eq('quiz_id', quizId)
      .order('order_index')
    const sortedQs = qs ? qs.map((q) => ({ ...q, answers: [...q.answers].sort((a, b) => a.order_index - b.order_index) })) : []
    const firstQuestionId = sortedQs?.[0]?.id
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

    const { data: qs } = await supabase
      .from('questions')
      .select('id')
      .eq('quiz_id', quizId)
      .order('order_index')
    const nextQuestionId = qs?.[next]?.id
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
    if (error) { setError(error.message); return }
  }

  async function endGame() {
    const { error } = await supabase
      .from('sessions')
      .update({ state: 'finished' })
      .eq('id', sessionId)
    if (error) { setError(error.message); return }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4">
      <h1 className="text-3xl font-bold mb-8">Host</h1>

      {loading && <p className="text-slate-400">Loading…</p>}
      {error && <p className="text-red-400 mb-4">{error}</p>}

      {joinCode ? (
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

              {timeRemaining !== null && (
                <div className="text-6xl font-bold text-white tabular-nums">
                  {timeRemaining}
                </div>
              )}

              {currentQuestionSlots && (
                <div className="w-full grid grid-cols-2 gap-3">
                  {currentQuestionSlots.map((slot) => {
                    const currentQ = hostQuestions[currentQuestionIndex]
                    const answer = currentQ?.answers?.find((a) => a.id === slot.answer_id)
                    return (
                      <div
                        key={slot.slot_index}
                        className="flex flex-col items-center gap-1 p-3 rounded-xl"
                        style={{ backgroundColor: SLOT_COLORS[slot.color] }}
                      >
                        <SlotIcon name={slot.icon} className="text-white" />
                        <span className="text-white text-xs font-medium text-center leading-tight">
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
      ) : (
        <div className="w-full max-w-sm flex flex-col gap-3">
          <Link
            to="/create"
            className="w-full text-center border-2 border-dashed border-slate-600 hover:border-indigo-500 hover:bg-indigo-950 text-slate-400 hover:text-indigo-300 font-semibold py-3 rounded-xl transition-colors"
          >
            + Create a new quiz
          </Link>
          {quizzes.map((quiz) => (
            <div key={quiz.id} className="bg-slate-800 rounded-xl px-5 py-4 flex items-center justify-between">
              <span className="font-medium">{quiz.title}</span>
              <button
                onClick={() => createSession(quiz.id)}
                className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
              >
                Create session
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
