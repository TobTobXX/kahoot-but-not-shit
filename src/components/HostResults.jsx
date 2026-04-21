import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import SlotIcon from './SlotIcon'
import Header from './Header'
import { SLOT_COLORS, SLOT_ICONS } from '../lib/slots'
import { useI18n } from '../context/I18nContext'

// Post-session results screen shown to the host when state === 'finished'.
// Displays the final leaderboard and a per-question breakdown.
export default function HostResults({ sessionId }) {
  const [leaderboard, setLeaderboard] = useState([])
  const [questions, setQuestions] = useState([])
  // Map: session_question_id → { slots, sessionAnswers, correct_slot_indices }
  const [questionData, setQuestionData] = useState({})
  const [loading, setLoading] = useState(true)
  const { t } = useI18n()

  useEffect(() => {
    async function fetchAll() {
      // 1. Final leaderboard
      const { data: lb } = await supabase
        .from('players')
        .select('id, nickname, score, correct_count')
        .eq('session_id', sessionId)
        .order('score', { ascending: false })
        .order('nickname')
      setLeaderboard(lb ?? [])

      // 2. Session questions for this session (ordered by question_index)
      const { data: sqs } = await supabase
        .from('session_questions')
        .select('id, question_index, question_text, time_limit, points, image_url, slots, correct_slot_indices')
        .eq('session_id', sessionId)
        .order('question_index')
      if (!sqs || sqs.length === 0) { setLoading(false); return }
      setQuestions(sqs)

      // 3. All session_answers for these questions
      const sqIds = sqs.map((sq) => sq.id)
      const { data: sessionAnswers } = await supabase
        .from('session_answers')
        .select('session_question_id, slot_index, response_time_ms')
        .in('session_question_id', sqIds)

      // Index by session_question_id
      const data = {}
      for (const sq of sqs) {
        data[sq.id] = {
          slots: sq.slots ?? [],
          sessionAnswers: (sessionAnswers ?? []).filter((sa) => sa.session_question_id === sq.id),
          correct_slot_indices: sq.correct_slot_indices ?? [],
        }
      }
      setQuestionData(data)
      setLoading(false)
    }

    fetchAll()
  }, [sessionId])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">{t('hostResults.loading')}</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <div className="px-6 py-2 border-b border-gray-200">
        <h1 className="text-xl font-bold">{t('hostResults.gameOver')}</h1>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row gap-0 overflow-hidden">
        {/* Final leaderboard */}
        <aside className="lg:w-72 xl:w-80 flex-shrink-0 border-b lg:border-b-0 lg:border-r border-gray-200 overflow-y-auto">
          <div className="px-6 py-4">
            <h2 className="text-lg font-semibold mb-4">{t('hostResults.leaderboard')}</h2>
            <div className="flex flex-col gap-2">
              {leaderboard.map((player, i) => {
                const medal = i === 0 ? 'text-yellow-500' : i === 1 ? 'text-gray-400' : i === 2 ? 'text-amber-600' : 'text-gray-400'
                return (
                  <div
                    key={player.id}
                    className="flex items-center gap-3 px-4 py-3 rounded-lg bg-indigo-100"
                  >
                    <span className={`font-bold w-6 text-right tabular-nums ${medal}`}>{i + 1}</span>
                    <span className="flex-1 font-semibold truncate">{player.nickname}</span>
                    <span className="text-gray-900 font-bold tabular-nums">{player.score}</span>
                    <span className="text-gray-500 text-sm tabular-nums">{player.correct_count ?? 0}/{questions.length}</span>
                  </div>
                )
              })}
              {leaderboard.length === 0 && (
                <p className="text-gray-400 text-sm">{t('hostResults.noPlayers')}</p>
              )}
            </div>
          </div>
        </aside>

        {/* Per-question breakdown */}
        <main className="flex-1 overflow-y-auto px-6 py-4">
          <h2 className="text-lg font-semibold mb-4">{t('hostResults.breakdown')}</h2>
          <div className="flex flex-col gap-6">
            {questions.map((sq, qi) => {
              const { slots, sessionAnswers, correct_slot_indices } = questionData[sq.id] ?? { slots: [], sessionAnswers: [], correct_slot_indices: [] }
              const correctSlotSet = new Set(correct_slot_indices)
              const totalResponses = sessionAnswers.length
              const correctResponses = sessionAnswers.filter((sa) => correctSlotSet.has(sa.slot_index)).length
              const pctCorrect = totalResponses > 0 ? Math.round((correctResponses / totalResponses) * 100) : null
              const timesMs = sessionAnswers.map((sa) => sa.response_time_ms).filter((v) => v != null)
              const avgTimeS = timesMs.length > 0 ? (timesMs.reduce((a, b) => a + b, 0) / timesMs.length / 1000).toFixed(1) : null

              // Count responses per slot_index
              const countBySlot = {}
              for (const sa of sessionAnswers) {
                countBySlot[sa.slot_index] = (countBySlot[sa.slot_index] ?? 0) + 1
              }

              return (
                <div key={sq.id} className="bg-indigo-50 rounded-xl p-5 flex gap-4">
                  {/* Optional image — left side */}
                  {sq.image_url && (
                    <div className="w-32 h-28 shrink-0 self-start rounded-lg overflow-hidden bg-indigo-100/50 flex items-center justify-center">
                      <img
                        src={sq.image_url}
                        alt=""
                        className="max-w-full max-h-full object-contain"
                      />
                    </div>
                  )}

                  {/* Question content — right side */}
                  <div className="flex-1 flex flex-col gap-4 min-w-0">
                  {/* Question header */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <span className="text-gray-400 font-mono text-sm mt-0.5 shrink-0">Q{qi + 1}</span>
                      <p className="font-semibold text-gray-900">{sq.question_text}</p>
                    </div>
                    <div className="flex gap-4 text-sm shrink-0">
                      {pctCorrect !== null && (
                        <span className={`font-bold ${pctCorrect >= 50 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {t('hostResults.pctCorrect', { pct: pctCorrect })}
                        </span>
                      )}
                      {pctCorrect === null && <span className="text-gray-400">{t('hostResults.noAnswers')}</span>}
                      {avgTimeS !== null && (
                        <span className="text-gray-500">{t('hostResults.avgTime', { time: avgTimeS })}</span>
                      )}
                    </div>
                  </div>

                  {/* Response distribution */}
                  {slots.length > 0 && (
                    <div className="flex flex-col gap-2">
                      {slots.map((slot) => {
                        const count = countBySlot[slot.slot_index] ?? 0
                        const barWidth = totalResponses > 0 ? Math.round((count / totalResponses) * 100) : 0
                        const isCorrect = correctSlotSet.has(slot.slot_index)
                        return (
                          <div key={slot.slot_index} className="flex items-center gap-3">
                            {/* Color + icon chip */}
                            <div
                              className="w-8 h-8 rounded flex items-center justify-center shrink-0"
                              style={{ backgroundColor: SLOT_COLORS[slot.slot_index] }}
                            >
                              <SlotIcon name={SLOT_ICONS[slot.slot_index]} size={18} className="text-white" />
                            </div>
                            {/* Bar */}
                            <div className="flex-1 flex items-center gap-2">
                              <div className="flex-1 bg-indigo-200 rounded-full h-5 overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all"
                                  style={{
                                    width: `${barWidth}%`,
                                    backgroundColor: SLOT_COLORS[slot.slot_index],
                                    opacity: 0.85,
                                  }}
                                />
                              </div>
                              <span className="text-sm text-gray-500 tabular-nums w-6 text-right">{count}</span>
                            </div>
                            {/* Answer text + correct tick */}
                            <div className="flex items-center gap-1 w-40 lg:w-56 shrink-0">
                              {isCorrect && <span className="text-emerald-400 font-bold">✓</span>}
                              <span className={`text-sm truncate ${isCorrect ? 'text-gray-900 font-medium' : 'text-gray-500'}`}>
                                {slot.answer_text}
                              </span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                  </div>{/* end question content */}
                </div>
              )
            })}
          </div>
        </main>
      </div>
    </div>
  )
}
