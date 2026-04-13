import SlotIcon from './SlotIcon'
import { SLOT_COLOR_HEX } from '../lib/slots'

// Full-screen active question display with large answer buttons,
// game PIN, timer, and bottom navigation controls.
export default function HostActiveQuestion({
  joinCode,
  question,
  currentQuestionIndex,
  totalQuestions,
  timeRemaining,
  questionOpen,
  slots,
  answerCount,
  playerCount,
  loadingSlots,
  isFullscreen,
  onToggleFullscreen,
  onClose,
  onNext,
  onEnd,
}) {
  return (
    <div className="fixed inset-0 flex flex-col bg-slate-900">
      {/* Top bar: Game PIN center, question counter left */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-800/50">
        <div className="text-slate-400 text-sm w-24">
          Question <span className="text-white font-bold">{currentQuestionIndex + 1}</span> / {totalQuestions}
        </div>

        <div className="flex-1 flex justify-center">
          {joinCode && (
            <div className="bg-slate-700 px-4 py-1.5 rounded-full">
              <span className="text-slate-400 text-sm mr-2">Game PIN:</span>
              <span className="text-white font-bold text-lg tracking-wider">{joinCode}</span>
            </div>
          )}
        </div>

        <div className="w-24" />
      </div>

      {/* Question text */}
      <div className="px-6 py-4">
        {question && (
          <h1 className="text-3xl md:text-4xl font-bold text-center text-white leading-tight">
            {question.question_text}
          </h1>
        )}
      </div>

      {/* Main content area: answers take most space */}
      <div className="flex-1 flex flex-col px-4 pb-4 min-h-0">
        {/* Answer grid - large buttons */}
        {slots && (
          <div className="flex-1 grid grid-cols-2 gap-3 min-h-0">
            {slots.map((slot) => {
              const answer = question?.answers?.find((a) => a.id === slot.answer_id)
              return (
                <div
                  key={slot.slot_index}
                  className="flex items-center gap-4 px-6 rounded-2xl overflow-hidden"
                  style={{ backgroundColor: SLOT_COLOR_HEX[slot.color] }}
                >
                  <SlotIcon name={slot.icon} className="text-white flex-shrink-0" size={48} />
                  <span className="text-white font-bold text-xl md:text-2xl text-center flex-1 leading-tight">
                    {answer?.answer_text ?? ''}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Bottom bar: Timer left, controls center, fullscreen right */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-800/50">
        {/* Timer */}
        <div className="w-24">
          {timeRemaining !== null && (
            <div className="text-4xl font-bold text-white tabular-nums">
              {timeRemaining}
            </div>
          )}
        </div>

        {/* Navigation controls */}
        <div className="flex-1 flex justify-center gap-3">
          <button
            onClick={onClose}
            disabled={!questionOpen}
            className="bg-amber-600 hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-2 px-6 rounded-lg transition-colors"
          >
            Close
          </button>
          <button
            onClick={onNext}
            disabled={currentQuestionIndex >= totalQuestions - 1 || loadingSlots}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-2 px-6 rounded-lg transition-colors"
          >
            {loadingSlots ? '…' : 'Next'}
          </button>
          <button
            onClick={onEnd}
            className="bg-slate-600 hover:bg-slate-500 text-white font-semibold py-2 px-6 rounded-lg transition-colors"
          >
            End
          </button>
        </div>

        {/* Right side: Answer count + Fullscreen */}
        <div className="w-24 flex items-center justify-end gap-3">
          <div className="text-slate-400 text-sm text-right">
            <div className="font-bold text-white">{answerCount}</div>
            <div className="text-xs">/ {playerCount}</div>
          </div>

          <button
            onClick={onToggleFullscreen}
            className="p-2 text-slate-400 hover:text-white transition-colors"
            title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          >
            {isFullscreen ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
