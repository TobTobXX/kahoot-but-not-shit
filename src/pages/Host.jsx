import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

function generateJoinCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

export default function Host() {
  const [quizzes, setQuizzes] = useState([])
  const [joinCode, setJoinCode] = useState(null)
  const [sessionId, setSessionId] = useState(null)
  const [quizId, setQuizId] = useState(null)
  const [sessionState, setSessionState] = useState('waiting')
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [totalQuestions, setTotalQuestions] = useState(0)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('quizzes')
      .select('id, title')
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setQuizzes(data)
        setLoading(false)
      })
  }, [])

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

    setTotalQuestions(count)
    setCurrentQuestionIndex(0)
    setSessionState('active')
  }

  async function nextQuestion() {
    const next = currentQuestionIndex + 1
    const { error } = await supabase
      .from('sessions')
      .update({ current_question_index: next })
      .eq('id', sessionId)
    if (error) { setError(error.message); return }
    setCurrentQuestionIndex(next)
  }

  async function endGame() {
    const { error } = await supabase
      .from('sessions')
      .update({ state: 'finished' })
      .eq('id', sessionId)
    if (error) { setError(error.message); return }
    setSessionState('finished')
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4">
      <h1 className="text-3xl font-bold mb-8">Host</h1>

      {loading && <p className="text-slate-400">Loading quizzes…</p>}
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
                <span className="text-sm">Waiting for players…</span>
              </div>
              <button
                onClick={startGame}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-lg transition-colors"
              >
                Start game
              </button>
            </div>
          )}

          {sessionState === 'active' && (
            <div className="flex flex-col items-center gap-4 w-full">
              <p className="text-slate-300 text-sm">
                Question <span className="text-white font-bold">{currentQuestionIndex + 1}</span> / {totalQuestions}
              </p>
              <button
                onClick={nextQuestion}
                disabled={currentQuestionIndex >= totalQuestions - 1}
                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-3 rounded-lg transition-colors"
              >
                Next question
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
