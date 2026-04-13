import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState('signin')
  const [magicLink, setMagicLink] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [sent, setSent] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setSent(null)
    setLoading(true)

    if (magicLink) {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.origin + '/library' },
      })
      setLoading(false)
      if (error) setError(error.message)
      else setSent('Check your email for a magic link!')
      return
    }

    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      setLoading(false)
      if (error) setError(error.message)
      else navigate('/library')
    } else {
      const { error } = await supabase.auth.signUp({ email, password })
      setLoading(false)
      if (error) setError(error.message)
      else {
        setSent('Account created! Check your email to confirm, then sign in.')
        setMode('signin')
      }
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-slate-800 rounded-2xl shadow-xl p-8 flex flex-col gap-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Welcome</h1>
          <p className="text-slate-400 text-sm mt-1">
            {mode === 'signin' ? 'Sign in to your account' : 'Create an account'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm text-slate-400">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="you@example.com"
              required
            />
          </div>

          {!magicLink && (
            <div className="flex flex-col gap-1">
              <label className="text-sm text-slate-400">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="••••••••"
                required
              />
            </div>
          )}

          {error && <p className="text-red-400 text-sm">{error}</p>}
          {sent && <p className="text-emerald-400 text-sm">{sent}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 rounded-lg transition-colors"
          >
            {loading
              ? 'Please wait…'
              : magicLink
              ? 'Send magic link'
              : mode === 'signin'
              ? 'Sign in'
              : 'Create account'}
          </button>
        </form>

        {!magicLink && (
          <button
            type="button"
            onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
            className="text-center text-sm text-slate-400 hover:text-slate-300 transition-colors"
          >
            {mode === 'signin' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
          </button>
        )}

        {!sent && (
          <button
            type="button"
            onClick={() => setMagicLink((v) => !v)}
            className="text-center text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            {magicLink ? 'Use password instead' : 'Sign in with magic link'}
          </button>
        )}
      </div>
    </div>
  )
}
