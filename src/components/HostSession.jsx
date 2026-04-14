import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import HostLobby from './HostLobby'
import HostActiveQuestion from './HostActiveQuestion'
import HostQuestionReview from './HostQuestionReview'
import HostResults from './HostResults'
import { byOrderIndex } from '../lib/utils'

// Shown at /host/:sessionId. Manages the live game: waiting room, active
// question display, and the finished state.
export default function HostSession({ sessionId }) {
  const navigate = useNavigate()
  const [joinCode, setJoinCode] = useState(null)
  const [quizId, setQuizId] = useState(null)
  const [sessionState, setSessionState] = useState('waiting')
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [totalQuestions, setTotalQuestions] = useState(0)
  const [players, setPlayers] = useState([])
  const [questionOpen, setQuestionOpen] = useState(true)
  const [answerCount, setAnswerCount] = useState(0)
  const [currentQuestionSlots, setCurrentQuestionSlots] = useState(null)
  const [shuffleAnswers, setShuffleAnswers] = useState(false)
  const [showLeaderboard, setShowLeaderboard] = useState(false)
  const [reviewAnswerCounts, setReviewAnswerCounts] = useState({}) // answer_id → count
  const [reviewLeaderboard, setReviewLeaderboard] = useState(null)
  const [hostQuestions, setHostQuestions] = useState([])
  const [timeRemaining, setTimeRemaining] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const containerRef = useRef(null)
  const answersChannelRef = useRef(null)
  const questionOpenRef = useRef(true)

  // Track fullscreen state changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  const toggleFullscreen = async () => {
    if (!document.fullscreenElement) {
      await containerRef.current?.requestFullscreen()
    } else {
      await document.exitFullscreen()
    }
  }

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
          .select('id, nickname')
          .eq('session_id', data.id)
          .order('joined_at')
          .then(({ data: ps }) => {
            if (ps) setPlayers(ps)
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
        (payload) => setPlayers((ps) => [...ps, { id: payload.new.id, nickname: payload.new.nickname }])
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

  // Keep questionOpenRef in sync for use inside the timer callback
  useEffect(() => { questionOpenRef.current = questionOpen }, [questionOpen])

  // Auto-close the question when every player has answered
  useEffect(() => {
    if (!questionOpen || sessionState !== 'active') return
    if (players.length === 0 || answerCount < players.length) return
    if (questionOpenRef.current) closeQuestion() // eslint-disable-line react-hooks/immutability
  }, [answerCount, questionOpen, sessionState, players]) // eslint-disable-line react-hooks/exhaustive-deps -- closeQuestion is stable

  // Fetch review data (answer distribution + optional leaderboard) when a question closes
  useEffect(() => {
    if (questionOpen || sessionState !== 'active') {
      setReviewAnswerCounts({})
      setReviewLeaderboard(null)
      return
    }
    const questionId = hostQuestions[currentQuestionIndex]?.id
    const playerIds = players.map((p) => p.id)
    if (!questionId || playerIds.length === 0) return

    supabase
      .from('player_answers')
      .select('answer_id')
      .eq('question_id', questionId)
      .in('player_id', playerIds)
      .then(({ data }) => {
        const counts = {}
        for (const pa of data ?? []) {
          counts[pa.answer_id] = (counts[pa.answer_id] ?? 0) + 1
        }
        setReviewAnswerCounts(counts)
      })

    if (showLeaderboard) {
      supabase
        .from('players')
        .select('id, nickname, score')
        .eq('session_id', sessionId)
        .order('score', { ascending: false })
        .limit(5)
        .then(({ data }) => setReviewLeaderboard(data ?? []))
    }
  }, [questionOpen, currentQuestionIndex, sessionState]) // eslint-disable-line react-hooks/exhaustive-deps -- reads current snapshot of players/hostQuestions/sessionId/showLeaderboard

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
        if (t === null || t <= 0) {
          clearInterval(interval)
          if (questionOpenRef.current) closeQuestion()
          return 0
        }
        return t - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [questionOpen, currentQuestionIndex, sessionState, hostQuestions]) // eslint-disable-line react-hooks/exhaustive-deps -- closeQuestion is stable

  async function startGame() {
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
    setTotalQuestions(sortedQs.length)
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

  async function hostAgain() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    const code = [...Array(6)].map(() => chars[Math.floor(Math.random() * chars.length)]).join('')
    const { data, error: err } = await supabase
      .from('sessions')
      .insert({ quiz_id: quizId, join_code: code, state: 'waiting' })
      .select('id')
      .single()
    if (err) { setError(err.message); return }
    navigate(`/host?sessionId=${data.id}`)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-slate-400">Loading…</p>
      </div>
    )
  }

  // Results screen takes over the full viewport
  if (sessionState === 'finished') {
    return (
      <HostResults
        sessionId={sessionId}
        quizId={quizId}
        onHostAgain={hostAgain}
      />
    )
  }

  return (
    <div ref={containerRef} className="min-h-screen flex flex-col">
      <div className="flex justify-start px-6 py-4">
        {sessionState === 'waiting' && (
          <button
            onClick={() => navigate('/host')}
            className="text-sm text-slate-400 hover:text-white transition-colors"
          >
            &larr; Back to library
          </button>
        )}
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-4">
        {error && <p className="text-red-400 mb-4">{error}</p>}

        {sessionState === 'waiting' && (
          <HostLobby
            joinCode={joinCode}
            joinUrl={`${window.location.origin}/join?code=${joinCode}`}
            players={players}
            shuffleAnswers={shuffleAnswers}
            onShuffleChange={setShuffleAnswers}
            showLeaderboard={showLeaderboard}
            onShowLeaderboardChange={setShowLeaderboard}
            loadingSlots={loadingSlots}
            onStart={startGame}
          />
        )}

        {sessionState === 'active' && questionOpen && (
          <HostActiveQuestion
            joinCode={joinCode}
            question={hostQuestions[currentQuestionIndex]}
            currentQuestionIndex={currentQuestionIndex}
            totalQuestions={totalQuestions}
            timeRemaining={timeRemaining}
            slots={currentQuestionSlots}
            answerCount={answerCount}
            playerCount={players.length}
            loadingSlots={loadingSlots}
            isFullscreen={isFullscreen}
            onToggleFullscreen={toggleFullscreen}
            onClose={closeQuestion}
            onNext={nextQuestion}
            onEnd={endGame}
          />
        )}

        {sessionState === 'active' && !questionOpen && (
          <HostQuestionReview
            joinCode={joinCode}
            question={hostQuestions[currentQuestionIndex]}
            currentQuestionIndex={currentQuestionIndex}
            totalQuestions={totalQuestions}
            slots={currentQuestionSlots}
            answerCounts={reviewAnswerCounts}
            leaderboard={showLeaderboard ? reviewLeaderboard : null}
            loadingSlots={loadingSlots}
            isFullscreen={isFullscreen}
            onToggleFullscreen={toggleFullscreen}
            onNext={nextQuestion}
            onEnd={endGame}
          />
        )}
      </div>
    </div>
  )
}
