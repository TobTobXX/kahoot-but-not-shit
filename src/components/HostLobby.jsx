import { useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'

const MAX_VISIBLE_PLAYERS = 20

// Waiting room shown before the host starts the game.
export default function HostLobby({ joinCode, joinUrl, players, shuffleAnswers, onShuffleChange, showLeaderboard, onShowLeaderboardChange, loadingSlots, onStart }) {
  const [copied, setCopied] = useState(false)

  function copyCode() {
    navigator.clipboard.writeText(joinCode).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  const visiblePlayers = players.slice(0, MAX_VISIBLE_PLAYERS)
  const hiddenCount = players.length - visiblePlayers.length
  const domain = joinUrl ? new URL(joinUrl).host : ''

  return (
    <div className="w-full flex flex-col items-center gap-8 py-6">

      {/* ── Join instructions ── */}
      <div className="flex flex-col items-center gap-6 text-center">
        <div>
          <p className="text-slate-400 text-lg mb-1">
            Join at <span className="text-white font-semibold">{domain}</span>
          </p>
          <p className="text-slate-400 text-sm">or enter the code below</p>
        </div>

        {/* Clickable join code */}
        <button
          onClick={copyCode}
          title="Click to copy"
          className="group relative flex flex-col items-center cursor-pointer select-none"
        >
          <span className={`text-8xl font-bold tracking-widest transition-colors ${copied ? 'text-green-400' : 'text-white group-hover:text-indigo-300'}`}>
            {copied ? 'Copied!' : joinCode}
          </span>
          <span className="text-xs text-slate-500 mt-1 group-hover:text-slate-400 transition-colors">
            click to copy
          </span>
        </button>

        {/* QR code */}
        <div className="flex flex-col items-center gap-2">
          <div className="p-2 bg-white rounded-lg">
            <QRCodeSVG value={joinUrl} size={180} bgColor="#ffffff" fgColor="#0f172a" />
          </div>
          <a
            href={joinUrl}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-indigo-400 hover:text-indigo-300 underline underline-offset-2 transition-colors"
          >
            {joinUrl}
          </a>
        </div>
      </div>

      {/* ── Controls ── */}
      <div className="flex flex-col items-center gap-3 w-full max-w-xs">
        <label className="flex items-center gap-2 text-slate-300 text-sm cursor-pointer select-none">
          <input
            type="checkbox"
            checked={shuffleAnswers}
            onChange={(e) => onShuffleChange(e.target.checked)}
            className="w-4 h-4 accent-indigo-500"
          />
          Shuffle answer positions
        </label>
        <label className="flex items-center gap-2 text-slate-300 text-sm cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showLeaderboard}
            onChange={(e) => onShowLeaderboardChange(e.target.checked)}
            className="w-4 h-4 accent-indigo-500"
          />
          Show top 5 between questions
        </label>
        <button
          onClick={onStart}
          disabled={loadingSlots}
          className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 rounded-lg transition-colors"
        >
          {loadingSlots ? 'Starting…' : `Start game (${players.length} player${players.length !== 1 ? 's' : ''})`}
        </button>
      </div>

      {/* ── Player list ── */}
      <div className="flex flex-col items-center gap-3 w-full max-w-2xl">
        <div className="flex items-center gap-2 text-slate-400 text-sm">
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse inline-block" />
          {players.length === 0
            ? 'Waiting for players…'
            : `${players.length} player${players.length !== 1 ? 's' : ''} joined`}
        </div>
        {visiblePlayers.length > 0 && (
          <div className="flex flex-wrap justify-center gap-2">
            {visiblePlayers.map((p) => (
              <span
                key={p.id}
                className="px-3 py-1 bg-slate-700 text-slate-200 text-sm rounded-full"
              >
                {p.nickname}
              </span>
            ))}
            {hiddenCount > 0 && (
              <span className="px-3 py-1 bg-slate-600 text-slate-400 text-sm rounded-full">
                +{hiddenCount} more
              </span>
            )}
          </div>
        )}
      </div>

    </div>
  )
}
