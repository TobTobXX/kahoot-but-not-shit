import SlotIcon from './SlotIcon'

// Shown on the player screen after a question closes: result banner,
// slot feedback grid, and live leaderboard while waiting for next question.
export default function FeedbackView({ isCorrect, pointsEarned, slots, slotProps, leaderboard, playerId }) {
  const playerStreak = leaderboard.find(p => p.id === playerId)?.streak ?? 0
  const playerFlames = Math.max(0, playerStreak - 2)

  return (
    <div className="w-full max-w-xl flex flex-col gap-4">
      {/* Result banner */}
      {isCorrect !== null ? (
        <div className={`rounded-xl px-6 py-4 text-center font-bold text-xl ${isCorrect ? 'bg-emerald-600' : 'bg-red-600'}`}>
          {isCorrect ? `Correct! +${pointsEarned} points${playerFlames > 0 ? ' ' + '🔥'.repeat(playerFlames) : ''}` : 'Wrong'}
        </div>
      ) : (
        <div className="rounded-xl px-6 py-4 text-center font-bold text-xl bg-slate-700">
          You didn't answer
        </div>
      )}

      {/* Slot grid with correct/wrong highlights */}
      <div className="grid grid-cols-2 gap-3">
        {slots.map((slot) => {
          const { className, style } = slotProps(slot.slot_index, slot.color)
          return (
            <div key={slot.slot_index} className={className} style={style}>
              <SlotIcon name={slot.icon} />
            </div>
          )
        })}
      </div>

      {/* Leaderboard — player above, self, player below */}
      {leaderboard.length > 0 && (() => {
        const idx = leaderboard.findIndex(p => p.id === playerId)
        const visible = [idx - 1, idx, idx + 1].filter(i => i >= 0 && i < leaderboard.length)
        return (
          <div className="flex flex-col gap-2">
            {visible.map(i => {
              const p = leaderboard[i]
              return (
                <div
                  key={p.id}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg ${p.id === playerId ? 'bg-indigo-700' : 'bg-slate-800'}`}
                >
                  <span className="text-slate-400 font-mono w-6 text-right">{i + 1}</span>
                  <span className="flex-1 font-semibold">{p.nickname}</span>
                  <span className="text-slate-300">{p.score}{Math.max(0, (p.streak ?? 0) - 2) > 0 && ' ' + '🔥'.repeat(Math.max(0, (p.streak ?? 0) - 2))}</span>
                </div>
              )
            })}
          </div>
        )
      })()}

      <p className="text-slate-400 text-sm text-center">Waiting for next question…</p>
    </div>
  )
}
