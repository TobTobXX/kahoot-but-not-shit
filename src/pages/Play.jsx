import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Play() {
  const { code } = useParams()
  const [nickname, setNickname] = useState(null)
  const [sessionState, setSessionState] = useState(null)
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(null)
  const [sessionQuizId, setSessionQuizId] = useState(null)
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
      setSessionQuizId(session.quiz_id)
    }

    load()
  }, [code])

  if (error) return <p style={{ color: 'red' }}>{error}</p>
  if (!nickname) return <p>Loading...</p>

  if (sessionState === 'waiting') {
    return (
      <div>
        <p>Playing as <strong>{nickname}</strong></p>
        <p>Waiting for the host to start...</p>
      </div>
    )
  }

  if (sessionState === 'finished') {
    return (
      <div>
        <p>Playing as <strong>{nickname}</strong></p>
        <p>Game over.</p>
      </div>
    )
  }

  // sessionState === 'active' — question display handled in section 3
  return (
    <div>
      <p>Playing as <strong>{nickname}</strong></p>
      <p>Question {currentQuestionIndex + 1}</p>
    </div>
  )
}
