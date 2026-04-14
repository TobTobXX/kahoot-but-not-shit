import { useEffect, useRef, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import SlotIcon from '../components/SlotIcon'
import FeedbackView from '../components/FeedbackView'
import { SLOT_COLOR_HEX } from '../lib/slots'
import { byOrderIndex } from '../lib/utils'

export default function Play() {
  const [searchParams] = useSearchParams()
  const code = searchParams.get('code')
  const navigate = useNavigate()
  const [nickname, setNickname] = useState(null)
  const [sessionId, setSessionId] = useState(null)
  const [sessionState, setSessionState] = useState(null)
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(null)
  const [questions, setQuestions] = useState([])
  const [submittedAnswerId, setSubmittedAnswerId] = useState(null)
  // answerSubmitted: player just submitted in this session (optimistic UI lock).
  // alreadyAnswered: server rejected with a duplicate-key error (answered in a prior connection).
  const [answerSubmitted, setAnswerSubmitted] = useState(false)
  const [alreadyAnswered, setAlreadyAnswered] = useState(false)
  const [feedbackShown, setFeedbackShown] = useState(false)
  const [isCorrect, setIsCorrect] = useState(null)
  const [pointsEarned, setPointsEarned] = useState(0)
  const [leaderboard, setLeaderboard] = useState([])
  const [error, setError] = useState(null)

  // One-way latch: flips to true the first time the session goes active so questions
  // are fetched lazily (either on initial load or on the first realtime 'active' event).
  const wasActiveRef = useRef(false)
  const sessionIdRef = useRef(null)
  const quizIdRef = useRef(null)
  const questionsRef = useRef([])
  // Track previous values to detect transitions inside the realtime callback, where
  // state reads would return stale closure values.
  const prevQuestionIndexRef = useRef(null)
  const prevQuestionOpenRef = useRef(null)
  const currentQuestionSlotsRef = useRef(null)
  const channelRef = useRef(null)
  const [currentQuestionSlots, setCurrentQuestionSlots] = useState(null)
  const [correctSlotIndex, setCorrectSlotIndex] = useState(null)

  // Keep refs in sync so async callbacks always see current values
  useEffect(() => { questionsRef.current = questions }, [questions])
  useEffect(() => { sessionIdRef.current = sessionId }, [sessionId])
  useEffect(() => { currentQuestionSlotsRef.current = currentQuestionSlots }, [currentQuestionSlots])

  // slots is passed as a parameter (not read from state) because this function is
  // called from within the realtime callback where currentQuestionSlots state may lag.
  async function loadFeedback(closedQuestion, sid, pid, slots) {
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
      if (slots && correctAnswers?.length === 1) {
        const correctAnswerId = correctAnswers[0].id
        const idx = slots.findIndex((s) => s.answer_id === correctAnswerId)
        setCorrectSlotIndex(idx >= 0 ? idx : null)
      } else {
        setCorrectSlotIndex(null)
      }
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

  // Effect 1: load session, player, and initial question state.
  // Sets sessionId (and quizIdRef) which triggers the realtime effect below.
  useEffect(() => {
    async function loadSession() {
      if (!code) {
        setError('No join code provided')
        return
      }

      const { data: session, error: sessionError } = await supabase
        .from('sessions')
        .select('id, state, current_question_index, quiz_id, question_open, current_question_slots')
        .eq('join_code', code)
        .single()

      if (sessionError || !session) {
        setError('Session not found')
        return
      }

      const stored = JSON.parse(localStorage.getItem(`player_${code}`) ?? 'null')
      const playerId = stored?.player_id
      if (!playerId) {
        navigate(`/join?code=${code}`, { replace: true })
        return
      }

      const { data: player, error: playerError } = await supabase
        .from('players')
        .select('nickname')
        .eq('id', playerId)
        .single()

      if (playerError || !player) {
        navigate(`/join?code=${code}`, { replace: true })
        return
      }

      setNickname(player.nickname)
      setSessionState(session.state)
      setCurrentQuestionIndex(session.current_question_index)
      setSessionId(session.id)
      sessionIdRef.current = session.id
      quizIdRef.current = session.quiz_id
      prevQuestionIndexRef.current = session.current_question_index
      prevQuestionOpenRef.current = session.question_open
      setCurrentQuestionSlots(session.current_question_slots ?? null)

      if (session.state === 'active') {
        wasActiveRef.current = true
        const { data: qs, error: qsError } = await supabase
          .from('questions')
          .select('id, question_text, order_index, points, answers(id, answer_text, order_index)')
          .eq('quiz_id', session.quiz_id)
          .order('order_index')

        if (qsError) { setError(qsError.message); return }

        const sorted = qs.map((q) => ({
          ...q,
          answers: [...q.answers].sort(byOrderIndex),
        }))
        setQuestions(sorted)
        questionsRef.current = sorted

        const currentQuestion = sorted[session.current_question_index]
        if (currentQuestion) {
          if (!session.question_open) {
            await loadFeedback(currentQuestion, session.id, playerId, session.current_question_slots ?? null)
          } else {
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
    }

    loadSession()
  }, [code, navigate])

  // Effect 2: subscribe to session updates via realtime.
  // Runs once sessionId is known (set by Effect 1). quizId is accessed via
  // quizIdRef so it doesn't need to be a dependency.
  useEffect(() => {
    if (!sessionId) return

    const channel = supabase
      .channel(`player-session-${code}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'sessions', filter: `join_code=eq.${code}` },
        (payload) => {
          const newState = payload.new.state
          const newIndex = payload.new.current_question_index
          const newQuestionOpen = payload.new.question_open
          const newSlots = payload.new.current_question_slots ?? null
          const prevOpen = prevQuestionOpenRef.current

          if (newState === 'finished') {
            localStorage.removeItem(`player_${code}`)
          }
          setSessionState(newState)
          setCurrentQuestionIndex(newIndex)
          setCurrentQuestionSlots(newSlots)
          prevQuestionOpenRef.current = newQuestionOpen

          if (newIndex !== prevQuestionIndexRef.current) {
            prevQuestionIndexRef.current = newIndex
            setSubmittedAnswerId(null)
            setAnswerSubmitted(false)
            setAlreadyAnswered(false)
            setFeedbackShown(false)
            setIsCorrect(null)
            setPointsEarned(0)
            setCorrectSlotIndex(null)
          }

          if (!wasActiveRef.current && newState === 'active') {
            wasActiveRef.current = true
            supabase
              .from('questions')
              .select('id, question_text, order_index, points, answers(id, answer_text, order_index)')
              .eq('quiz_id', quizIdRef.current)
              .order('order_index')
              .then(({ data, error }) => {
                if (error) { setError(error.message); return }
                const sorted = data.map((q) => ({
                  ...q,
                  answers: [...q.answers].sort(byOrderIndex),
                }))
                setQuestions(sorted)
                questionsRef.current = sorted
              })
          }

          if (wasActiveRef.current && prevOpen === true && newQuestionOpen === false) {
            const closedQuestion = questionsRef.current[newIndex]
            const sid = sessionIdRef.current
            const pid = JSON.parse(localStorage.getItem(`player_${code}`) ?? 'null')?.player_id
            const slots = payload.new.current_question_slots ?? null
            loadFeedback(closedQuestion, sid, pid, slots)
          }
        }
      )
      .subscribe()

    channelRef.current = channel

    return () => {
      supabase.removeChannel(channel)
      channelRef.current = null
    }
  }, [sessionId, code])

  async function submitAnswer(slotIndex) {
    if (answerSubmitted || alreadyAnswered) return

    const playerId = JSON.parse(localStorage.getItem(`player_${code}`) ?? 'null')?.player_id
    const question = questionsRef.current[currentQuestionIndex]
    const slots = currentQuestionSlotsRef.current
    if (!playerId || !question || !slots) return

    const slot = slots[slotIndex]
    if (!slot) return

    const answerId = slot.answer_id
    setSubmittedAnswerId(answerId)

    const { error } = await supabase
      .rpc('submit_answer', { p_player_id: playerId, p_question_id: question.id, p_answer_id: answerId })

    if (error) {
      // 23505 = PostgreSQL unique_violation: player already answered this question
      // (submitted from another tab or a previous connection).
      if (error.code === '23505') {
        setAlreadyAnswered(true)
      } else {
        setError(error.message)
      }
      return
    }

    setAnswerSubmitted(true)
  }

  // Returns { className, style } for a slot, covering all interaction states.
  // Used by both the active-question grid (buttons) and the feedback grid (divs).
  function slotProps(slotIndex, color) {
    const base = 'h-full rounded-2xl flex flex-col items-center justify-center gap-2 transition-opacity'
    const style = { backgroundColor: SLOT_COLOR_HEX[color] }

    if (feedbackShown) {
      if (correctSlotIndex === slotIndex) {
        return { className: `${base} ring-4 ring-emerald-300 cursor-default`, style }
      }
      if (submittedAnswerId !== null && currentQuestionSlots?.find((s) => s.slot_index === slotIndex)?.answer_id === submittedAnswerId) {
        return { className: `${base} ring-4 ring-white cursor-default`, style }
      }
      return { className: `${base} opacity-40 cursor-default`, style }
    }

    if (answerSubmitted || alreadyAnswered) {
      if (currentQuestionSlots?.find((s) => s.slot_index === slotIndex)?.answer_id === submittedAnswerId) {
        return { className: `${base} ring-4 ring-white cursor-default`, style }
      }
      return { className: `${base} opacity-40 cursor-default`, style }
    }
    return { className: `${base} cursor-pointer active:brightness-110`, style }
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

  const playerId = JSON.parse(localStorage.getItem(`player_${code}`) ?? 'null')?.player_id
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
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 min-h-0">

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
            <button
              onClick={() => navigate('/')}
              className="mt-2 text-indigo-400 hover:text-indigo-300 text-sm transition-colors"
            >
              Back to home
            </button>
          </div>
        )}

        {/* Active but past last question */}
        {sessionState === 'active' && !question && !feedbackShown && (
          <div className="flex flex-col items-center gap-4">
            <p className="text-2xl font-semibold text-center">Waiting for the game to end…</p>
            <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
          </div>
        )}

        {/* Feedback + leaderboard (replaces question when it closes) */}
        {question && feedbackShown && currentQuestionSlots && (
          <FeedbackView
            isCorrect={isCorrect}
            pointsEarned={pointsEarned}
            slots={currentQuestionSlots}
            slotProps={slotProps}
            leaderboard={leaderboard}
            playerId={playerId}
          />
        )}

        {/* Question and answers */}
        {question && !feedbackShown && currentQuestionSlots && (
          <div className="w-full max-w-xl flex flex-col gap-6 flex-1 min-h-0">
            <div className="grid grid-cols-2 grid-rows-2 gap-3 flex-1">
              {currentQuestionSlots.map((slot) => {
                const { className, style } = slotProps(slot.slot_index, slot.color)
                return (
                  <button
                    key={slot.slot_index}
                    onClick={() => submitAnswer(slot.slot_index)}
                    disabled={answerSubmitted || alreadyAnswered}
                    className={className}
                    style={style}
                  >
                    <SlotIcon name={slot.icon} />
                  </button>
                )
              })}
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
