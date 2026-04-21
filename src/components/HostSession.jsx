import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useI18n } from '../context/I18nContext'
import HostLobby from './HostLobby'
import HostActiveQuestion from './HostActiveQuestion'
import HostQuestionReview from './HostQuestionReview'
import HostResults from './HostResults'
import Header from './Header'

// Shown at /host?sessionId=<uuid>. Manages the live game: waiting room,
// active question display, review screen, and the finished state.
export default function HostSession({ sessionId }) {
  const { t } = useI18n()
  const [joinCode, setJoinCode] = useState(null)
  const [sessionState, setSessionState] = useState('waiting')
  // Full session_questions row for the currently active question.
  // Has: id, question_index, question_text, image_url, time_limit, points,
  //      slots ([{slot_index, answer_id, answer_text}]), started_at,
  //      closed_at, correct_slot_indices
  const [activeSessionQuestion, setActiveSessionQuestion] = useState(null)
  const [totalQuestions, setTotalQuestions] = useState(0)
  const [players, setPlayers] = useState([])
  const [answerCount, setAnswerCount] = useState(0)
  const [shuffleAnswers, setShuffleAnswers] = useState(false)
  const [showLeaderboard, setShowLeaderboard] = useState(true)
  const [reviewAnswerCounts, setReviewAnswerCounts] = useState({}) // slot_index → count
  const [reviewLeaderboard, setReviewLeaderboard] = useState(null)
  const [timeRemaining, setTimeRemaining] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadingNext, setLoadingNext] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const containerRef = useRef(null)
  const answersChannelRef = useRef(null)
  // Ref copy of sessionState so the timer interval callback always reads the
  // current value without a stale closure.
  const sessionStateRef = useRef('waiting')
  const hostSecretRef = useRef(localStorage.getItem(`host_${sessionId}`) ?? null)
  // Track the previously seen active_question_id so the realtime handler can
  // detect question changes without reading (potentially stale) React state.
  const prevActiveQuestionIdRef = useRef(null)
  // showLeaderboard ref so fetchReviewData can read the current value from inside
  // the realtime callback without a stale closure.
  const showLeaderboardRef = useRef(true)

  // ─── Helper functions ─────────────────────────────────────────────────────
  // All functions are defined before the useEffects that call them so the
  // linter can verify call order.

  function loadSessionQuestion(sqId) {
    supabase
      .from('session_questions')
      .select('id, question_index, question_text, image_url, time_limit, points, slots, started_at, closed_at, correct_slot_indices')
      .eq('id', sqId)
      .single()
      .then(({ data: sq }) => { if (sq) setActiveSessionQuestion(sq) })
  }

  function fetchReviewData(sqId) {
    supabase
      .from('session_answers')
      .select('slot_index')
      .eq('session_question_id', sqId)
      .then(({ data }) => {
        const counts = {}
        for (const sa of data ?? []) {
          counts[sa.slot_index] = (counts[sa.slot_index] ?? 0) + 1
        }
        setReviewAnswerCounts(counts)
      })

    if (showLeaderboardRef.current) {
      supabase
        .from('players')
        .select('id, nickname, score')
        .eq('session_id', sessionId)
        .order('score', { ascending: false })
        .limit(5)
        .then(({ data }) => setReviewLeaderboard(data ?? []))
    }
  }

  function subscribeToAnswers(sqId) {
    if (answersChannelRef.current) {
      supabase.removeChannel(answersChannelRef.current)
    }
    console.log('[host] Subscribing to answers for session_question', sqId)
    const ch = supabase
      .channel(`answers-${sessionId}-${sqId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'session_answers', filter: `session_question_id=eq.${sqId}` },
        () => setAnswerCount((c) => c + 1)
      )
      .subscribe((status) => console.log('[host] Answers channel:', status))
    answersChannelRef.current = ch
  }

  async function closeQuestion() {
    if (sessionStateRef.current !== 'asking') return
    console.log('[host] Closing question…')
    const { error: err } = await supabase.rpc('score_question', {
      p_session_id: sessionId,
      p_host_secret: hostSecretRef.current,
    })
    if (err) { console.error('[host] score_question failed:', err.message); setError(err.message) }
    // State transitions to 'reviewing' via the realtime event.
  }

  async function openNextQuestion() {
    console.log(`[host] Opening next question (shuffle=${shuffleAnswers})…`)
    setLoadingNext(true)
    const { data: sq, error: sqError } = await supabase.rpc('next_question', {
      p_session_id: sessionId,
      p_host_secret: hostSecretRef.current,
      p_shuffle: shuffleAnswers,
    })
    setLoadingNext(false)
    if (sqError) { console.error('[host] next_question failed:', sqError.message); setError(sqError.message); return }

    console.log('[host] Question', sq.question_index + 1, 'opened')
    // Populate started_at client-side (the RPC doesn't return it). Using Date.now()
    // gives < 1 s drift, which is acceptable for the host's own timer.
    // On reconnect the full row is fetched from the DB with the accurate value.
    const question = { ...sq, started_at: new Date().toISOString() }
    setActiveSessionQuestion(question)
    setAnswerCount(0)
    setReviewAnswerCounts({})
    setReviewLeaderboard(null)
    subscribeToAnswers(sq.id)
  }

  async function endGame() {
    console.log('[host] Ending game…')
    const { error: err } = await supabase.rpc('end_session', {
      p_session_id: sessionId,
      p_host_secret: hostSecretRef.current,
    })
    if (err) { console.error('[host] end_session failed:', err.message); setError(err.message) }
  }

  const toggleFullscreen = async () => {
    if (!document.fullscreenElement) {
      await containerRef.current?.requestFullscreen()
    } else {
      await document.exitFullscreen()
    }
  }

  // ─── Effects ──────────────────────────────────────────────────────────────

  // Keep refs in sync with state
  useEffect(() => { sessionStateRef.current = sessionState }, [sessionState])
  useEffect(() => { showLeaderboardRef.current = showLeaderboard }, [showLeaderboard])

  // Track fullscreen state changes
  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  // Load session on mount
  useEffect(() => {
    supabase
      .from('sessions')
      .select('id, state, total_questions, active_question_id')
      .eq('id', sessionId)
      .single()
      .then(({ data, error: err }) => {
        if (err) {
          setError(t('hostSession.sessionNotFound'))
          setLoading(false)
          return
        }
        setJoinCode(localStorage.getItem(`host_${sessionId}_join_code`) ?? '')
        setSessionState(data.state)
        sessionStateRef.current = data.state
        setTotalQuestions(data.total_questions)
        prevActiveQuestionIdRef.current = data.active_question_id

        if (data.active_question_id) {
          loadSessionQuestion(data.active_question_id)
        }

        setLoading(false)

        supabase
          .from('players')
          .select('id, nickname')
          .eq('session_id', data.id)
          .order('joined_at')
          .then(({ data: ps }) => { if (ps) setPlayers(ps) })
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- sessionId intentionally only read on mount

  // Realtime: session state/active_question_id changes + player joins
  useEffect(() => {
    console.log('[host] Subscribing to session and player channels…')
    const sessionChannel = supabase
      .channel(`host-session-${sessionId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'sessions', filter: `id=eq.${sessionId}` },
        (payload) => {
          const { state, active_question_id } = payload.new
          console.log('[host] Session update: state=%s aqid=%s', state, active_question_id)

          setSessionState(state)
          sessionStateRef.current = state

          if (active_question_id !== prevActiveQuestionIdRef.current) {
            prevActiveQuestionIdRef.current = active_question_id
            setAnswerCount(0)
            setReviewAnswerCounts({})
            setReviewLeaderboard(null)

            if (active_question_id) {
              subscribeToAnswers(active_question_id)
              loadSessionQuestion(active_question_id)
            }
          }

          if (state === 'reviewing' && active_question_id) {
            // Re-fetch to get correct_slot_indices (set by score_question).
            loadSessionQuestion(active_question_id)
            fetchReviewData(active_question_id)
          }
        }
      )
      .subscribe((status) => console.log('[host] Session channel:', status))

    const playersChannel = supabase
      .channel(`players-${sessionId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'players', filter: `session_id=eq.${sessionId}` },
        (payload) => {
          console.log('[host] Player joined:', payload.new.nickname)
          setPlayers((ps) => [...ps, { id: payload.new.id, nickname: payload.new.nickname }])
        }
      )
      .subscribe((status) => console.log('[host] Players channel:', status))

    return () => {
      console.log('[host] Unsubscribing from session and player channels')
      supabase.removeChannel(sessionChannel)
      supabase.removeChannel(playersChannel)
    }
  }, [sessionId]) // eslint-disable-line react-hooks/exhaustive-deps -- helper functions are stable within mount lifetime

  // Unsubscribe from answers channel on unmount
  useEffect(() => {
    return () => {
      if (answersChannelRef.current) {
        supabase.removeChannel(answersChannelRef.current)
        answersChannelRef.current = null
      }
    }
  }, [])

  // Auto-close the question when every player has answered
  useEffect(() => {
    if (sessionState !== 'asking') return
    if (players.length === 0 || answerCount < players.length) return
    closeQuestion()
  }, [answerCount, sessionState, players]) // eslint-disable-line react-hooks/exhaustive-deps -- closeQuestion is stable

  // Countdown timer — resets when a new question opens
  useEffect(() => {
    if (sessionState !== 'asking' || !activeSessionQuestion) {
      setTimeRemaining(null)
      return
    }
    const { time_limit, started_at } = activeSessionQuestion
    if (!time_limit || time_limit === 0) {
      setTimeRemaining(null)
      return
    }

    const elapsedMs = Date.now() - new Date(started_at).getTime()
    const initial = Math.max(0, time_limit - Math.floor(elapsedMs / 1000))
    setTimeRemaining(initial)

    if (initial === 0) {
      closeQuestion()
      return
    }

    const interval = setInterval(() => {
      setTimeRemaining((remaining) => {
        if (remaining === null || remaining <= 0) {
          clearInterval(interval)
          if (sessionStateRef.current === 'asking') closeQuestion()
          return 0
        }
        return remaining - 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [sessionState, activeSessionQuestion?.id]) // eslint-disable-line react-hooks/exhaustive-deps -- closeQuestion is stable

  // ─── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">{t('hostSession.loading')}</p>
      </div>
    )
  }

  if (sessionState === 'finished') {
    return (
      <HostResults
        sessionId={sessionId}
      />
    )
  }

  return (
    <div ref={containerRef} className="min-h-screen flex flex-col">
      {sessionState === 'waiting' && <Header />}

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
            loadingSlots={loadingNext}
            onStart={openNextQuestion}
          />
        )}

        {sessionState === 'asking' && (
          <HostActiveQuestion
            joinCode={joinCode}
            sessionQuestion={activeSessionQuestion}
            currentQuestionIndex={activeSessionQuestion?.question_index ?? 0}
            totalQuestions={totalQuestions}
            timeRemaining={timeRemaining}
            answerCount={answerCount}
            playerCount={players.length}
            loadingNext={loadingNext}
            isFullscreen={isFullscreen}
            onToggleFullscreen={toggleFullscreen}
            onClose={closeQuestion}
            onNext={openNextQuestion}
            onEnd={endGame}
          />
        )}

        {sessionState === 'reviewing' && (
          <HostQuestionReview
            joinCode={joinCode}
            sessionQuestion={activeSessionQuestion}
            currentQuestionIndex={activeSessionQuestion?.question_index ?? 0}
            totalQuestions={totalQuestions}
            answerCounts={reviewAnswerCounts}
            leaderboard={showLeaderboard ? reviewLeaderboard : null}
            loadingNext={loadingNext}
            isFullscreen={isFullscreen}
            onToggleFullscreen={toggleFullscreen}
            onNext={openNextQuestion}
            onEnd={endGame}
          />
        )}
      </div>
    </div>
  )
}
