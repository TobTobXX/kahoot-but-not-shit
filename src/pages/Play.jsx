import { useEffect, useRef, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import SlotIcon from '../components/SlotIcon'
import FeedbackView from '../components/FeedbackView'
import { SLOT_COLORS, SLOT_ICONS } from '../lib/slots'
import { useI18n } from '../context/I18nContext'

export default function Play() {
  const [searchParams] = useSearchParams()
  const code = searchParams.get('code')
  const navigate = useNavigate()
  const { t } = useI18n()
  const [nickname, setNickname] = useState(null)
  const [sessionId, setSessionId] = useState(null)
  const [sessionState, setSessionState] = useState(null)
  // Full session_questions row for the active question.
  const [activeSessionQuestion, setActiveSessionQuestion] = useState(null)
  // Total number of questions played (known once the session finishes).
  const [totalQuestions, setTotalQuestions] = useState(null)
  // The slot_index the player chose for the current question (null = not answered).
  const [submittedSlotIndex, setSubmittedSlotIndex] = useState(null)
  // answerSubmitted: player just submitted in this session (optimistic UI lock).
  // alreadyAnswered: server rejected with a duplicate-key error.
  const [answerSubmitted, setAnswerSubmitted] = useState(false)
  const [alreadyAnswered, setAlreadyAnswered] = useState(false)
  const [feedbackShown, setFeedbackShown] = useState(false)
  const [isCorrect, setIsCorrect] = useState(null)
  const [pointsEarned, setPointsEarned] = useState(0)
  const [correctSlotIndices, setCorrectSlotIndices] = useState([])
  const [leaderboard, setLeaderboard] = useState([])
  const [storedPlayerId, setStoredPlayerId] = useState(null)
  const [error, setError] = useState(null)

  const sessionIdRef = useRef(null)
  const activeSessionQuestionRef = useRef(null)
  const channelRef = useRef(null)
  // Track the previous active_question_id to detect question changes inside
  // the realtime callback (where React state reads are stale closures).
  const prevActiveQuestionIdRef = useRef(null)

  // Keep refs in sync so async callbacks always see current values
  useEffect(() => { sessionIdRef.current = sessionId }, [sessionId])
  useEffect(() => { activeSessionQuestionRef.current = activeSessionQuestion }, [activeSessionQuestion])

  // Loads the closed question's feedback: player answer, correctness, points, leaderboard.
  // closedSQ must be the fully-fetched session_questions row (with correct_slot_indices set).
  async function loadFeedback(closedSQ, sid, pid) {
    console.log('[play] Loading feedback for session_question', closedSQ?.id)
    setFeedbackShown(true)
    if (closedSQ && pid) {
      const { data: sa } = await supabase
        .from('session_answers')
        .select('slot_index, points_earned')
        .eq('player_id', pid)
        .eq('session_question_id', closedSQ.id)
        .maybeSingle()

      const csi = closedSQ.correct_slot_indices ?? []
      const correct = sa ? csi.includes(sa.slot_index) : false
      console.log('[play] Player answer:', sa ? `slot ${sa.slot_index}, ${correct ? 'correct' : 'wrong'}, ${sa.points_earned} pts` : 'no answer')
      setSubmittedSlotIndex(sa?.slot_index ?? null)
      setAnswerSubmitted(!!sa)
      setIsCorrect(sa ? correct : null)
      setPointsEarned(sa?.points_earned ?? 0)
      setCorrectSlotIndices(csi)
    }
    if (sid) {
      console.log('[play] Fetching leaderboard…')
      const { data: lb } = await supabase
        .from('players')
        .select('id, nickname, score, streak')
        .eq('session_id', sid)
        .order('score', { ascending: false })
        .order('nickname')
      if (lb) setLeaderboard(lb)
    }
    console.log('[play] Feedback loaded')
  }

  // Effect 1: load session, player, and initial question state.
  // Sets sessionId which triggers the realtime subscription below.
  useEffect(() => {
    async function loadSession() {
      if (!code) {
        setError(t('play.noCode'))
        return
      }

      const stored = JSON.parse(localStorage.getItem(`player_${code}`) ?? 'null')
      const playerId = stored?.player_id
      if (!playerId || !stored?.session_id) {
        navigate(`/join?code=${code}`, { replace: true })
        return
      }
      setStoredPlayerId(playerId)

      const { data: session, error: sessionError } = await supabase
        .from('sessions')
        .select('id, state, active_question_id')
        .eq('id', stored.session_id)
        .single()

      if (sessionError || !session) {
        setError(t('play.sessionNotFound'))
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
      setSessionId(session.id)
      sessionIdRef.current = session.id
      prevActiveQuestionIdRef.current = session.active_question_id

      if (session.active_question_id) {
        // Fetch the active session_questions row
        const { data: sq } = await supabase
          .from('session_questions')
          .select('id, question_index, question_text, image_url, time_limit, points, slots, started_at, closed_at, correct_slot_indices')
          .eq('id', session.active_question_id)
          .single()

        if (sq) {
          setActiveSessionQuestion(sq)
          activeSessionQuestionRef.current = sq

          if (session.state === 'reviewing') {
            // Question is already closed — load feedback immediately
            await loadFeedback(sq, session.id, playerId)
          } else if (session.state === 'asking') {
            // Check if player already answered this question
            const { data: sa } = await supabase
              .from('session_answers')
              .select('slot_index')
              .eq('player_id', playerId)
              .eq('session_question_id', sq.id)
              .maybeSingle()
            if (sa) {
              setSubmittedSlotIndex(sa.slot_index)
              setAnswerSubmitted(true)
            }
          }
        }
      }
    }

    loadSession()
  }, [code, navigate]) // eslint-disable-line react-hooks/exhaustive-deps -- t is stable

  // Effect 2: subscribe to session updates via realtime.
  // Runs once sessionId is known (set by Effect 1).
  useEffect(() => {
    if (!sessionId) return

    console.log('[play] Subscribing to session channel…')
    const channel = supabase
      .channel(`player-session-${sessionId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'sessions', filter: `id=eq.${sessionId}` },
        (payload) => {
          const { state, active_question_id } = payload.new
          console.log('[play] Session update: state=%s aqid=%s', state, active_question_id)

          if (state === 'finished') {
            localStorage.removeItem(`player_${code}`)
            // Fetch the final question count from session_questions so the leaderboard
            // can show correct_count / total.
            supabase
              .from('session_questions')
              .select('id', { count: 'exact', head: true })
              .eq('session_id', sessionId)
              .then(({ count }) => { if (count != null) setTotalQuestions(count) })
          }
          setSessionState(state)

          if (active_question_id !== prevActiveQuestionIdRef.current) {
            // New question opened — reset all per-question state
            prevActiveQuestionIdRef.current = active_question_id
            setSubmittedSlotIndex(null)
            setAnswerSubmitted(false)
            setAlreadyAnswered(false)
            setFeedbackShown(false)
            setIsCorrect(null)
            setPointsEarned(0)
            setCorrectSlotIndices([])

            if (active_question_id) {
              supabase
                .from('session_questions')
                .select('id, question_index, question_text, image_url, time_limit, points, slots, started_at, closed_at, correct_slot_indices')
                .eq('id', active_question_id)
                .single()
                .then(({ data: sq }) => {
                  if (sq) {
                    setActiveSessionQuestion(sq)
                    activeSessionQuestionRef.current = sq
                  }
                })
            }
          }

          if (state === 'reviewing') {
            // Re-fetch session_questions to get correct_slot_indices, then show feedback.
            const sqId = active_question_id ?? activeSessionQuestionRef.current?.id
            const sid = sessionIdRef.current
            const pid = JSON.parse(localStorage.getItem(`player_${code}`) ?? 'null')?.player_id
            if (sqId) {
              supabase
                .from('session_questions')
                .select('id, question_index, question_text, image_url, time_limit, points, slots, started_at, closed_at, correct_slot_indices')
                .eq('id', sqId)
                .single()
                .then(({ data: sq }) => {
                  if (sq) {
                    setActiveSessionQuestion(sq)
                    activeSessionQuestionRef.current = sq
                    loadFeedback(sq, sid, pid)
                  }
                })
            }
          }
        }
      )
      .subscribe((status) => console.log('[play] Session channel:', status))

    channelRef.current = channel

    return () => {
      console.log('[play] Unsubscribing from session channel')
      supabase.removeChannel(channel)
      channelRef.current = null
    }
  }, [sessionId]) // eslint-disable-line react-hooks/exhaustive-deps -- code/loadFeedback read via closures; stable refs handle async cases

  // Effect 3: fetch final leaderboard when the session finishes
  useEffect(() => {
    if (sessionState !== 'finished' || !sessionId) return
    supabase
      .from('players')
      .select('id, nickname, score, correct_count')
      .eq('session_id', sessionId)
      .order('score', { ascending: false })
      .order('nickname')
      .then(({ data }) => { if (data) setLeaderboard(data) })
  }, [sessionState, sessionId])

  async function submitAnswer(slotIndex) {
    if (answerSubmitted || alreadyAnswered) return

    const stored = JSON.parse(localStorage.getItem(`player_${code}`) ?? 'null')
    const playerId = stored?.player_id
    const playerSecret = stored?.player_secret
    const sq = activeSessionQuestionRef.current
    if (!playerId || !playerSecret || !sq) return

    setSubmittedSlotIndex(slotIndex)

    console.log('[play] Submitting answer for session_question', sq.id, 'slot', slotIndex)
    const { error } = await supabase.rpc('submit_answer', {
      p_player_id: playerId,
      p_player_secret: playerSecret,
      p_session_question_id: sq.id,
      p_slot_index: slotIndex,
    })

    if (error) {
      // 23505 = PostgreSQL unique_violation: player already answered this question
      if (error.code === '23505') {
        console.warn('[play] Answer already submitted (duplicate)')
        setAlreadyAnswered(true)
      } else {
        console.error('[play] submit_answer failed:', error.message)
        setError(error.message)
      }
      return
    }

    console.log('[play] Answer submitted')
    setAnswerSubmitted(true)
  }

  // Returns { className, style } for a slot button/div covering all interaction states.
  function slotProps(slotIndex) {
    const base = `${feedbackShown ? 'py-6' : 'h-full'} rounded-2xl flex flex-col items-center justify-center gap-2 transition-opacity`
    const style = { backgroundColor: SLOT_COLORS[slotIndex] }

    if (feedbackShown) {
      if (correctSlotIndices.includes(slotIndex)) {
        return { className: `${base} ring-4 ring-emerald-300 cursor-default`, style }
      }
      if (submittedSlotIndex !== null && slotIndex === submittedSlotIndex) {
        return { className: `${base} ring-4 ring-white cursor-default`, style }
      }
      return { className: `${base} opacity-40 cursor-default`, style }
    }

    if (answerSubmitted || alreadyAnswered) {
      if (submittedSlotIndex !== null && slotIndex === submittedSlotIndex) {
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
        <p className="text-red-400 text-2xl font-bold mb-2">{t('play.error')}</p>
        <p className="text-gray-600">{error}</p>
      </div>
    )
  }

  if (!nickname) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-4 border-gray-700 border-t-transparent animate-spin" />
      </div>
    )
  }

  const playerId = JSON.parse(localStorage.getItem(`player_${code}`) ?? 'null')?.player_id
  const slots = activeSessionQuestion?.slots ?? []
  const isPlaying = sessionState === 'asking' || sessionState === 'reviewing'

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top bar */}
      <div className="px-4 py-3 border-b border-gray-200">
        <p className="text-sm text-gray-500">
          {t('play.playingAs')} <strong className="text-gray-900">{nickname}</strong>
        </p>
      </div>

      {/* Inner content */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 min-h-0">

        {/* Waiting */}
        {sessionState === 'waiting' && (
          <div className="flex flex-col items-center gap-4">
            <p className="text-2xl font-semibold text-center">{t('play.waitingForHost')}</p>
            <div className="w-2 h-2 rounded-full bg-gray-500 animate-pulse" />
          </div>
        )}

        {/* Game over */}
        {sessionState === 'finished' && (
          <div className="w-full max-w-sm flex flex-col gap-4">
            <div className="text-center">
              <p className="text-4xl font-bold">{t('play.gameOver')}</p>
              <p className="text-gray-600 mt-1">{t('play.thanksForPlaying', { nickname })}</p>
            </div>
            {leaderboard.length > 0 && (
              <div className="flex flex-col gap-2">
                {leaderboard.map((p, i) => (
                  <div
                    key={p.id}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg ${p.id === storedPlayerId ? 'bg-indigo-700 text-white' : 'bg-indigo-100'}`}
                  >
                    <span className={`font-mono w-6 text-right ${p.id === storedPlayerId ? 'text-indigo-200' : 'text-gray-400'}`}>{i + 1}</span>
                    <span className="flex-1 font-semibold">{p.nickname}</span>
                    <span className={`font-bold ${p.id === storedPlayerId ? 'text-white' : 'text-gray-900'}`}>{p.score}</span>
                    <span className={`text-sm ${p.id === storedPlayerId ? 'text-indigo-200' : 'text-gray-500'}`}>{p.correct_count ?? 0}{totalQuestions != null ? `/${totalQuestions}` : ''}</span>
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={() => navigate('/')}
              className="text-indigo-600 hover:text-indigo-500 text-sm transition-colors text-center"
            >
              {t('play.backToHome')}
            </button>
          </div>
        )}

        {/* Active but no question yet (e.g. between states) */}
        {isPlaying && !activeSessionQuestion && !feedbackShown && (
          <div className="flex flex-col items-center gap-4">
            <p className="text-2xl font-semibold text-center">{t('play.waitingForEnd')}</p>
            <div className="w-2 h-2 rounded-full bg-gray-500 animate-pulse" />
          </div>
        )}

        {/* Feedback + leaderboard (replaces question when it closes) */}
        {isPlaying && feedbackShown && slots.length > 0 && (
          <FeedbackView
            isCorrect={isCorrect}
            pointsEarned={pointsEarned}
            slots={slots}
            slotProps={slotProps}
            leaderboard={leaderboard}
            playerId={playerId}
          />
        )}

        {/* Question and answers */}
        {sessionState === 'asking' && !feedbackShown && slots.length > 0 && (
          <div className="w-full max-w-xl flex flex-col gap-6 flex-1 min-h-0">
            <div className="grid grid-cols-2 grid-rows-2 gap-3 flex-1">
              {slots.map((slot) => {
                const { className, style } = slotProps(slot.slot_index)
                return (
                  <button
                    key={slot.slot_index}
                    onClick={() => submitAnswer(slot.slot_index)}
                    disabled={answerSubmitted || alreadyAnswered}
                    className={className}
                    style={style}
                  >
                    <SlotIcon name={SLOT_ICONS[slot.slot_index]} />
                  </button>
                )
              })}
            </div>
            {answerSubmitted && (
              <p className="text-center text-gray-500 text-sm">{t('play.answerSubmitted')}</p>
            )}
            {alreadyAnswered && (
              <p className="text-center text-gray-500 text-sm">{t('play.alreadyAnswered')}</p>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
