import SlotIcon from './SlotIcon'
import { SLOT_COLOR_HEX } from '../lib/slots'

// Full-screen between-question view: correct answer revealed, per-slot counts,
// optional top-5 leaderboard. Shown after a question closes, before Next is pressed.
export default function HostQuestionReview({
  joinCode,
  question,
  currentQuestionIndex,
  totalQuestions,
  slots,
  answerCounts,    // map: answer_id → count
  leaderboard,     // array of { id, nickname, score } or null if disabled
  loadingSlots,
  isFullscreen,
  onToggleFullscreen,
  onNext,
  onEnd,
}) {
  const totalAnswers = Object.values(answerCounts).reduce((a, b) => a + b, 0)

  return (
    <div className="fixed inset-0 flex flex-col bg-slate-900">
      {/* Question text */}
      <div className="flex items-center justify-center px-16 py-6 min-h-48">
        {question && (
          <h1 className="text-6xl md:text-7xl font-bold text-center text-white leading-tight">
            {question.question_text}
          </h1>
        )}
      </div>

      {/* Main: slot grid + optional leaderboard */}
      <div className="flex-1 flex gap-4 px-4 pb-4 min-h-0">
        {/* Slot grid */}
        <div className="flex-1 grid grid-cols-2 gap-4 min-h-0">
          {slots?.map((slot) => {
            const answer = question?.answers?.find((a) => a.id === slot.answer_id)
            const isCorrect = answer?.is_correct ?? false
            const count = answerCounts[slot.answer_id] ?? 0
            const pct = totalAnswers > 0 ? Math.round((count / totalAnswers) * 100) : 0

            return (
              <div
                key={slot.slot_index}
                className={`relative flex items-center gap-6 px-8 rounded-2xl overflow-hidden transition-opacity ${isCorrect ? '' : 'opacity-40'}`}
                style={{ backgroundColor: SLOT_COLOR_HEX[slot.color] }}
              >
                {isCorrect && (
                  <div className="absolute inset-0 ring-8 ring-inset ring-emerald-300 rounded-2xl pointer-events-none" />
                )}
                <SlotIcon name={slot.icon} className="text-white flex-shrink-0" size={100} />
                <span className="text-white font-bold text-5xl md:text-6xl flex-1 leading-tight">
                  {answer?.answer_text ?? ''}
                </span>
                {/* Count badge — bottom-right */}
                <div className="flex flex-col items-end shrink-0">
                  <span className="text-white font-bold text-6xl tabular-nums leading-none">{count}</span>
                  <span className="text-white/70 text-3xl tabular-nums">{pct}%</span>
                </div>
              </div>
            )
          })}
        </div>

        {/* Top-5 leaderboard (optional) */}
        {leaderboard && leaderboard.length > 0 && (
          <div className="w-96 flex flex-col gap-3 justify-center shrink-0">
            <p className="text-slate-400 text-lg font-semibold text-center mb-1">Top players</p>
            {leaderboard.map((p, i) => {
              const medal = i === 0 ? 'text-yellow-400' : i === 1 ? 'text-slate-300' : i === 2 ? 'text-amber-600' : 'text-slate-500'
              return (
                <div key={p.id} className="flex items-center gap-3 px-5 py-4 bg-slate-800 rounded-xl">
                  <span className={`font-bold text-2xl w-7 text-right tabular-nums ${medal}`}>{i + 1}</span>
                  <span className="flex-1 font-semibold text-2xl truncate">{p.nickname}</span>
                  <span className="text-slate-300 text-2xl tabular-nums">{p.score}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Bottom bar */}
      <div className="flex items-center justify-between px-6 py-7 bg-slate-800/50">
        {/* Join code */}
        <div className="w-48">
          {joinCode && (
            <div className="text-slate-400 text-2xl">
              <span className="mr-2">Code:</span>
              <span className="text-white font-bold text-4xl tracking-wider">{joinCode}</span>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex-1 flex justify-center gap-4">
          <button
            onClick={onNext}
            disabled={currentQuestionIndex >= totalQuestions - 1 || loadingSlots}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-5 px-28 rounded-lg transition-colors text-2xl"
          >
            {loadingSlots ? '…' : 'Next'}
          </button>
          <button
            onClick={onEnd}
            className="bg-slate-600 hover:bg-slate-500 text-white font-semibold py-5 px-28 rounded-lg transition-colors text-2xl"
          >
            End
          </button>
        </div>

        {/* Question count + fullscreen */}
        <div className="w-48 flex items-center justify-end gap-4">
          <div className="text-slate-400 text-2xl whitespace-nowrap">
            <span className="mr-2">Question:</span>
            <span className="text-white font-bold text-5xl">{currentQuestionIndex + 1}</span>
            <span className="text-white font-bold text-5xl"> / {totalQuestions}</span>
          </div>
          <button
            onClick={onToggleFullscreen}
            className="p-2 text-slate-400 hover:text-white transition-colors"
            title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          >
            {isFullscreen ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="43" height="43" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="43" height="43" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
