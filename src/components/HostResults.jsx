import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import SlotIcon from './SlotIcon'
import Header from './Header'
import { SLOT_COLOR_HEX } from '../lib/slots'

// Post-session results screen shown to the host when state === 'finished'.
// Displays the final leaderboard and a per-question breakdown.
export default function HostResults({ sessionId, quizId, onHostAgain }) {
  const [leaderboard, setLeaderboard] = useState([])
  const [questions, setQuestions] = useState([])
  // Map: question_id → { slots: [...], answers: [...], playerAnswers: [...] }
  const [questionData, setQuestionData] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchAll() {
      // 1. Final leaderboard
      const { data: lb } = await supabase
        .from('players')
        .select('id, nickname, score, streak')
        .eq('session_id', sessionId)
        .order('score', { ascending: false })
        .order('nickname')
      setLeaderboard(lb ?? [])

      // 2. Questions for this quiz
      const { data: qs } = await supabase
        .from('questions')
        .select('id, question_text, time_limit, points, order_index')
        .eq('quiz_id', quizId)
        .order('order_index')
      if (!qs || qs.length === 0) { setLoading(false); return }
      setQuestions(qs)

      const questionIds = qs.map((q) => q.id)
      const playerIds = (lb ?? []).map((p) => p.id)

      // 3–5 in parallel: answers, slot assignments, player answers
      const [answersRes, slotsRes, paRes] = await Promise.all([
        supabase
          .from('answers')
          .select('id, question_id, answer_text, is_correct')
          .in('question_id', questionIds),
        supabase
          .from('session_question_answers')
          .select('question_id, slot_index, answer_id, color, icon')
          .eq('session_id', sessionId),
        playerIds.length > 0
          ? supabase
              .from('player_answers')
              .select('question_id, answer_id, response_time_ms')
              .in('player_id', playerIds)
          : Promise.resolve({ data: [] }),
      ])

      const answers = answersRes.data ?? []
      const slots = slotsRes.data ?? []
      const playerAnswers = paRes.data ?? []

      // Index everything by question_id
      const data = {}
      for (const q of qs) {
        data[q.id] = {
          slots: slots.filter((s) => s.question_id === q.id).sort((a, b) => a.slot_index - b.slot_index),
          answers: answers.filter((a) => a.question_id === q.id),
          playerAnswers: playerAnswers.filter((pa) => pa.question_id === q.id),
        }
      }
      setQuestionData(data)
      setLoading(false)
    }

    fetchAll()
  }, [sessionId, quizId])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-slate-400">Loading results…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <div className="flex items-center justify-between px-6 py-2 border-b border-slate-700">
        <h1 className="text-xl font-bold">Game over</h1>
        <div className="flex gap-3">
          <button
            onClick={onHostAgain}
            className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 px-5 rounded-lg text-sm transition-colors"
          >
            Host again
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row gap-0 overflow-hidden">
        {/* Final leaderboard */}
        <aside className="lg:w-72 xl:w-80 flex-shrink-0 border-b lg:border-b-0 lg:border-r border-slate-700 overflow-y-auto">
          <div className="px-6 py-4">
            <h2 className="text-lg font-semibold mb-4">Leaderboard</h2>
            <div className="flex flex-col gap-2">
              {leaderboard.map((player, i) => {
                const medal = i === 0 ? 'text-yellow-400' : i === 1 ? 'text-slate-300' : i === 2 ? 'text-amber-600' : 'text-slate-500'
                return (
                  <div
                    key={player.id}
                    className="flex items-center gap-3 px-4 py-3 rounded-lg bg-slate-800"
                  >
                    <span className={`font-bold w-6 text-right tabular-nums ${medal}`}>{i + 1}</span>
                    <span className="flex-1 font-semibold truncate">{player.nickname}</span>
                    <span className="text-slate-300 tabular-nums">{player.score}{Math.max(0, (player.streak ?? 0) - 2) > 0 && ' ' + '🔥'.repeat(Math.max(0, (player.streak ?? 0) - 2))}</span>
                  </div>
                )
              })}
              {leaderboard.length === 0 && (
                <p className="text-slate-500 text-sm">No players.</p>
              )}
            </div>
          </div>
        </aside>

        {/* Per-question breakdown */}
        <main className="flex-1 overflow-y-auto px-6 py-4">
          <h2 className="text-lg font-semibold mb-4">Per-question breakdown</h2>
          <div className="flex flex-col gap-6">
            {questions.map((q, qi) => {
              const { slots, answers, playerAnswers } = questionData[q.id] ?? { slots: [], answers: [], playerAnswers: [] }
              const totalResponses = playerAnswers.length
              const correctAnswerIds = new Set(answers.filter((a) => a.is_correct).map((a) => a.id))
              const correctResponses = playerAnswers.filter((pa) => correctAnswerIds.has(pa.answer_id)).length
              const pctCorrect = totalResponses > 0 ? Math.round((correctResponses / totalResponses) * 100) : null
              const timesMs = playerAnswers.map((pa) => pa.response_time_ms).filter((t) => t != null)
              const avgTimeS = timesMs.length > 0 ? (timesMs.reduce((a, b) => a + b, 0) / timesMs.length / 1000).toFixed(1) : null

              // Count responses per answer_id
              const countByAnswer = {}
              for (const pa of playerAnswers) {
                countByAnswer[pa.answer_id] = (countByAnswer[pa.answer_id] ?? 0) + 1
              }

              return (
                <div key={q.id} className="bg-slate-800 rounded-xl p-5 flex flex-col gap-4">
                  {/* Question header */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <span className="text-slate-500 font-mono text-sm mt-0.5 shrink-0">Q{qi + 1}</span>
                      <p className="font-semibold text-white">{q.question_text}</p>
                    </div>
                    <div className="flex gap-4 text-sm shrink-0">
                      {pctCorrect !== null && (
                        <span className={`font-bold ${pctCorrect >= 50 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {pctCorrect}% correct
                        </span>
                      )}
                      {pctCorrect === null && <span className="text-slate-500">No answers</span>}
                      {avgTimeS !== null && (
                        <span className="text-slate-400">Avg {avgTimeS}s</span>
                      )}
                    </div>
                  </div>

                  {/* Response distribution */}
                  {slots.length > 0 && (
                    <div className="flex flex-col gap-2">
                      {slots.map((slot) => {
                        const answer = answers.find((a) => a.id === slot.answer_id)
                        const count = countByAnswer[slot.answer_id] ?? 0
                        const barWidth = totalResponses > 0 ? Math.round((count / totalResponses) * 100) : 0
                        const isCorrect = correctAnswerIds.has(slot.answer_id)
                        return (
                          <div key={slot.slot_index} className="flex items-center gap-3">
                            {/* Color + icon chip */}
                            <div
                              className="w-8 h-8 rounded flex items-center justify-center shrink-0"
                              style={{ backgroundColor: SLOT_COLOR_HEX[slot.color] }}
                            >
                              <SlotIcon name={slot.icon} size={18} className="text-white" />
                            </div>
                            {/* Bar */}
                            <div className="flex-1 flex items-center gap-2">
                              <div className="flex-1 bg-slate-700 rounded-full h-5 overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all"
                                  style={{
                                    width: `${barWidth}%`,
                                    backgroundColor: SLOT_COLOR_HEX[slot.color],
                                    opacity: 0.85,
                                  }}
                                />
                              </div>
                              <span className="text-sm text-slate-400 tabular-nums w-6 text-right">{count}</span>
                            </div>
                            {/* Answer text + correct tick */}
                            <div className="flex items-center gap-1 w-40 lg:w-56 shrink-0">
                              {isCorrect && <span className="text-emerald-400 font-bold">✓</span>}
                              <span className={`text-sm truncate ${isCorrect ? 'text-white font-medium' : 'text-slate-400'}`}>
                                {answer?.answer_text ?? ''}
                              </span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </main>
      </div>
    </div>
  )
}
