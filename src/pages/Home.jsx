import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Header from '../components/Header'

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
      .in('state', ['waiting', 'active'])
      .single()

    if (sessionError || !session) {
      setError('Session not found')
      return
    }

    const stored = JSON.parse(localStorage.getItem(`player_${code}`) ?? 'null')
    if (stored?.player_id) {
      const { data: existingPlayer } = await supabase
        .from('players')
        .select('id')
        .eq('id', stored.player_id)
        .maybeSingle()

      if (existingPlayer) {
        localStorage.setItem(`player_${code}`, JSON.stringify({ player_id: existingPlayer.id, nickname }))
        navigate(`/play?code=${code}`)
        return
      }
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

    // player_id is the player's only credential — stored here and read back in Play.jsx
    // to identify the player to Supabase without requiring an account.
    localStorage.setItem(`player_${code}`, JSON.stringify({ player_id: player.id, nickname }))
    navigate(`/play?code=${code}`)
  }

  return (
    <div className="min-h-screen flex flex-col">

      <Header />

      {/* Center content */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 gap-10">
        <div className="flex flex-col items-center gap-6">
          <h1 className="text-5xl font-bold text-center">Kahoot but not shit</h1>
          <button
            onClick={() => navigate('/host')}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-8 py-3 rounded-xl text-lg transition-colors"
          >
            Host a game
          </button>
        </div>

        {/* Join section */}
        <div className="w-full max-w-sm flex flex-col gap-4">
          <h2 className="text-slate-400 text-sm font-semibold uppercase tracking-wider text-center">Join via code</h2>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <input
              type="text"
              maxLength={6}
              placeholder="Join code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              required
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <input
              type="text"
              placeholder="Nickname"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              required
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
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

      {/* Bottom right footer */}
      <div className='fixed bottom-4 right-4 flex items-center gap-3'>
        <a
          href='https://codeberg.org/TobTobXX/kahoot-but-not-shit'
          target='_blank'
          rel='noopener noreferrer'
          className='text-sm text-slate-500 hover:text-slate-300 transition-colors'
        >
          Source
        </a>
        <span className='text-slate-600'>|</span>
        <button
          disabled
          className='text-sm text-slate-600 cursor-not-allowed'
          title='Donate (coming soon)'
        >
          Donate
        </button>
      </div>

    </div>
  )
}
