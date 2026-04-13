import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

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

  // sessionState === 'active'
  if (currentQuestionIndex === null || currentQuestionIndex >= questions.length) {
    return (
      <div>
        <p>Playing as <strong>{nickname}</strong></p>
        <p>Waiting for the game to end...</p>
      </div>
    )
  }

  const question = questions[currentQuestionIndex]

  function handleAnswer(answer) {
    if (selectedAnswerId !== null) return
    setSelectedAnswerId(answer.id)
  }

  function answerStyle(answer) {
    if (selectedAnswerId === null) return {}
    if (answer.id === selectedAnswerId) {
      return { background: answer.is_correct ? 'green' : 'red', color: 'white' }
    }
    return { opacity: 0.5 }
  }

  return (
    <div>
      <p>Playing as <strong>{nickname}</strong></p>
      <p>{question.question_text}</p>
      <div>
        {question.answers.map((answer) => (
          <button
            key={answer.id}
            onClick={() => handleAnswer(answer)}
            disabled={selectedAnswerId !== null}
            style={answerStyle(answer)}
          >
            {answer.answer_text}
          </button>
        ))}
      </div>
    </div>
  )
}
