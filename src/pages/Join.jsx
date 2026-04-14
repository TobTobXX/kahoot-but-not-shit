import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Header from '../components/Header'

export default function Join() {
  const [searchParams] = useSearchParams()
  const code = searchParams.get('code')
  const navigate = useNavigate()

  const [checking, setChecking] = useState(true)
  const [nickname, setNickname] = useState('')
  const [error, setError] = useState(null)
  const [submitError, setSubmitError] = useState(null)

  useEffect(() => {
    if (!code) {
      setTimeout(() => {
        setError('No join code provided')
        setChecking(false)
      }, 0)
      return
    }

    async function check() {
      const stored = JSON.parse(localStorage.getItem(`player_${code}`) ?? 'null')

      const { data: session } = await supabase
        .from('sessions')
        .select('id, state')
        .eq('join_code', code)
        .maybeSingle()

      if (!session) {
        setError('Session not found')
        setChecking(false)
        return
      }

      if (session.state === 'finished') {
        if (stored) localStorage.removeItem(`player_${code}`)
        setError('This session has ended')
        setChecking(false)
        return
      }

      if (stored?.player_id) {
        const { data: player } = await supabase
          .from('players')
          .select('id')
          .eq('id', stored.player_id)
          .maybeSingle()

        if (player) {
          navigate(`/play?code=${code}`, { replace: true })
          return
        }

        // Player record gone — pre-fill nickname and show form
        setNickname(stored.nickname ?? '')
      }

      setChecking(false)
    }

    check()
  }, [code, navigate])

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitError(null)

    const { data: session } = await supabase
      .from('sessions')
      .select('id, state')
      .eq('join_code', code)
      .maybeSingle()

    if (!session || session.state === 'finished') {
      setSubmitError('Session not found or already ended')
      return
    }

    const { data: player, error: insertError } = await supabase
      .from('players')
      .insert({ session_id: session.id, nickname })
      .select('id')
      .single()

    if (insertError) {
      setSubmitError(insertError.message)
      return
    }

    localStorage.setItem(`player_${code}`, JSON.stringify({ player_id: player.id, nickname }))
    navigate(`/play?code=${code}`)
  }

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-4 border-white border-t-transparent animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <div className="flex-1 flex flex-col items-center justify-center px-4 gap-4">
          <p className="text-red-400 text-2xl font-bold">Error</p>
          <p className="text-slate-300">{error}</p>
          <a href="/" className="text-indigo-400 hover:underline text-sm">Back to home</a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <div className="flex-1 flex flex-col items-center justify-center px-4">
      <h1 className="text-3xl font-bold mb-2 text-center">Join game</h1>
      <p className="text-slate-400 mb-8 text-center font-mono tracking-widest">{code}</p>
      <div className="w-full max-w-sm bg-slate-800 rounded-2xl shadow-xl p-8">
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="flex flex-col gap-1">
            <label className="text-sm text-slate-400 font-medium">Nickname</label>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              required
              autoFocus
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          {submitError && <p className="text-red-400 text-sm">{submitError}</p>}
          <button
            type="submit"
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-lg transition-colors"
          >
            Join
          </button>
        </form>
      </div>
      </div>
    </div>
  )
}
