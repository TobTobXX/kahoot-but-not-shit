import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import Header from '../components/Header'

export default function Profile() {
  const { user } = useAuth()
  const [username, setUsername] = useState('')
  const [isPro, setIsPro] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('profiles')
        .select('username, is_pro')
        .eq('id', user.id)
        .single()

      if (data) {
        setUsername(data.username ?? '')
        setIsPro(data.is_pro ?? false)
      }
      setLoading(false)
    }
    load()
  }, [user.id])

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setMessage(null)

    const { error } = await supabase
      .from('profiles')
      .upsert({ id: user.id, username: username.trim() || null })

    if (error) {
      setMessage({ type: 'error', text: error.message })
    } else {
      setMessage({ type: 'success', text: 'Username saved.' })
    }

    setSaving(false)
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <div className="flex-1 flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-sm flex flex-col gap-6">

          <h1 className="text-2xl font-bold text-gray-900 text-center">Profile</h1>

          {loading ? (
            <p className="text-gray-500 text-center">Loading...</p>
          ) : (
            <form onSubmit={handleSave} className="flex flex-col gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Username
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Set a username"
                  className="w-full bg-white border border-gray-300 rounded-lg px-4 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {message && (
                <p className={message.type === 'error' ? 'text-red-400 text-sm' : 'text-green-500 text-sm'}>
                  {message.text}
                </p>
              )}

              <button
                type="submit"
                disabled={saving}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold py-3 rounded-lg transition-colors"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </form>
          )}

          <div className="border-t pt-6">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">Pro Status</span>
              <span className={`text-sm font-semibold px-2 py-0.5 rounded ${isPro ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>
                {isPro ? 'Pro' : 'Free'}
              </span>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}