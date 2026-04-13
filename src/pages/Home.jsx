import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Home() {
  const [code, setCode] = useState('')
  const [nickname, setNickname] = useState('')
  const [error, setError] = useState(null)
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)

    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('id')
      .eq('join_code', code)
      .eq('state', 'waiting')
      .single()

    if (sessionError || !session) {
      setError('Session not found or already started')
      return
    }

    const { data: player, error: playerError } = await supabase
      .from('players')
      .insert({ session_id: session.id, nickname })
      .select('id')
      .single()

    if (playerError) {
      setError(playerError.message)
      return
    }

    localStorage.setItem('player_id', player.id)
    navigate(`/play/${code}`)
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4">
      <h1 className="text-4xl font-bold mb-8 text-center">Kahoot but not shit</h1>
      <div className="w-full max-w-sm bg-slate-800 rounded-2xl shadow-xl p-8">
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="flex flex-col gap-1">
            <label className="text-sm text-slate-400 font-medium">Join code</label>
            <input
              type="text"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              required
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm text-slate-400 font-medium">Nickname</label>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              required
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            type="submit"
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-lg transition-colors"
          >
            Join
          </button>
        </form>
      </div>
    </div>
  )
}
