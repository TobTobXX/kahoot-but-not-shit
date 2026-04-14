import SlotIcon from './SlotIcon'
import { SLOT_COLOR_HEX } from '../lib/slots'

// Full-screen active question display with large answer buttons,
// game code, timer, and bottom navigation controls.
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
  isPaused,
  onToggleFullscreen,
  onClose,
  onNext,
  onBack,
  onReplay,
  onPause,
  onEnd,
}) {
  return (
    <div className="fixed inset-0 flex flex-col bg-slate-900">
      {/* Question row: Timer left, Answer count right */}
      <div className="flex items-center justify-center gap-8 px-8 py-6 min-h-64 relative">
        {/* Timer - left edge */}
        <div className="absolute left-20">
          {timeRemaining !== null && (
            <div className="bg-slate-700 rounded-2xl px-6 py-3 text-6xl font-bold text-white tabular-nums">
              {timeRemaining}
            </div>
          )}
        </div>

        {/* Question text - center */}
        <div className="flex-1 max-w-7xl">
          {question && (
            <h1 className="text-6xl md:text-7xl font-bold text-center text-white leading-tight">
              {question.question_text}
            </h1>
          )}
        </div>

        {/* Answer count - right edge, single line */}
        <div className="absolute right-20">
          <div className="bg-slate-700 rounded-2xl px-6 py-3 text-5xl font-bold text-white tabular-nums">
            {answerCount}<span className="text-3xl text-slate-400"> / {playerCount}</span>
          </div>
        </div>
      </div>

      {/* Main content area: answers take most space */}
      <div className="flex-1 flex flex-col px-4 pb-4 min-h-0">
        {/* Answer grid - large buttons */}
        {slots && (
          <div className="flex-1 grid grid-cols-2 gap-4 min-h-0">
            {slots.map((slot) => {
              const answer = question?.answers?.find((a) => a.id === slot.answer_id)
              return (
                <div
                  key={slot.slot_index}
                  className="flex items-center gap-6 px-8 rounded-2xl overflow-hidden"
                  style={{ backgroundColor: SLOT_COLOR_HEX[slot.color] }}
                >
                  <SlotIcon name={slot.icon} className="text-white flex-shrink-0" size={108} />
                  <span className="text-white font-bold text-5xl md:text-6xl text-center flex-1 leading-tight">
                    {answer?.answer_text ?? ''}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Bottom bar: Join code left, controls center, question count right */}
      <div className="flex items-center justify-between px-6 py-7 bg-slate-800/50">
        {/* Join code - lower left */}
        <div className="w-48">
          {joinCode && (
            <div className="text-slate-400 text-2xl">
              <span className="mr-2">Code:</span>
              <span className="text-white font-bold text-4xl tracking-wider">{joinCode}</span>
            </div>
          )}
        </div>

        {/* Navigation controls */}
        <div className="flex-1 flex justify-center gap-4">
          <button
            onClick={onBack}
            disabled={currentQuestionIndex === 0 || loadingSlots}
            className="bg-slate-600 hover:bg-slate-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-5 px-10 rounded-lg transition-colors text-2xl"
          >
            ←
          </button>
          <button
            onClick={onClose}
            disabled={!questionOpen}
            className="bg-amber-600 hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-5 px-16 rounded-lg transition-colors text-2xl"
          >
            Finish
          </button>
          <button
            onClick={onPause}
            disabled={!questionOpen}
            className="bg-slate-600 hover:bg-slate-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-5 px-10 rounded-lg transition-colors text-2xl"
          >
            {isPaused ? '▶' : '⏸'}
          </button>
          <button
            onClick={onReplay}
            disabled={questionOpen || loadingSlots}
            className="bg-slate-600 hover:bg-slate-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-5 px-10 rounded-lg transition-colors text-2xl"
          >
            ↺
          </button>
          <button
            onClick={onNext}
            disabled={currentQuestionIndex >= totalQuestions - 1 || loadingSlots}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-5 px-16 rounded-lg transition-colors text-2xl"
          >
            {loadingSlots ? '…' : 'Next →'}
          </button>
          <button
            onClick={onEnd}
            className="bg-slate-600 hover:bg-slate-500 text-white font-semibold py-5 px-10 rounded-lg transition-colors text-2xl"
          >
            End
          </button>
        </div>

        {/* Question count - bottom right */}
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
