// Shown in the waiting room before the host starts the game.
export default function HostLobby({ playerCount, shuffleAnswers, onShuffleChange, loadingSlots, onStart }) {
  return (
    <div className="flex flex-col items-center gap-4 w-full">
      <div className="flex items-center gap-2 text-slate-400">
        <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
        <span className="text-sm">{playerCount} player(s) joined</span>
      </div>
      <label className="flex items-center gap-2 text-slate-300 text-sm cursor-pointer select-none">
        <input
          type="checkbox"
          checked={shuffleAnswers}
          onChange={(e) => onShuffleChange(e.target.checked)}
          className="w-4 h-4 accent-indigo-500"
        />
        Shuffle answer positions
      </label>
      <button
        onClick={onStart}
        disabled={loadingSlots}
        className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 rounded-lg transition-colors"
      >
        {loadingSlots ? 'Starting…' : `Start game (${playerCount} players)`}
      </button>
    </div>
  )
}
