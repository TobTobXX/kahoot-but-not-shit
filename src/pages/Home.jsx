import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Header from '../components/Header'
import { useAuth } from '../context/AuthContext'
import { useI18n, SUPPORTED_LANGS, LANG_NAMES } from '../context/I18nContext'

export default function Home() {
  const [code, setCode] = useState('')
  const [nickname, setNickname] = useState('')
  const [error, setError] = useState(null)
  const navigate = useNavigate()
  const { user } = useAuth()
  const { t, lang, setLang } = useI18n()

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)

    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('state')
      .eq('join_code', code)
      .maybeSingle()

    if (sessionError || !session || !['waiting', 'active'].includes(session.state)) {
      setError(t('home.sessionNotFound'))
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
        navigate(`/play?code=${code}`)
        return
      }
    }

    const { data, error: joinError } = await supabase.rpc('join_session', {
      p_join_code: code,
      p_nickname: nickname,
    })

    if (joinError) {
      setError(joinError.message)
      return
    }

    localStorage.setItem(`player_${code}`, JSON.stringify({
      player_id: data.player_id,
      player_secret: data.secret,
      nickname,
      joined_at: Date.now(),
    }))
    navigate(`/play?code=${code}`)
  }

  return (
    <div className="min-h-screen flex flex-col">

      <Header />

      {/* Center content */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 gap-10">
        <div className="flex flex-col items-center gap-6">
          <h1 className="text-5xl font-bold text-center">Groupquiz</h1>
          <button
            onClick={() => navigate(user ? '/library' : '/browse')}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-8 py-3 rounded-xl text-lg transition-colors"
          >
            {t('home.hostGame')}
          </button>
        </div>

        {/* Join section */}
        <div className="w-full max-w-sm flex flex-col gap-4">
          <h2 className="text-gray-500 text-sm font-semibold uppercase tracking-wider text-center">{t('home.joinViaCode')}</h2>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <input
              type="text"
              maxLength={6}
              placeholder={t('home.joinCodePlaceholder')}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              required
              className="w-full bg-white border border-gray-300 rounded-lg px-4 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <input
              type="text"
              placeholder={t('home.nicknamePlaceholder')}
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              required
              className="w-full bg-white border border-gray-300 rounded-lg px-4 py-2.5 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button
              type="submit"
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-lg transition-colors"
            >
              {t('home.join')}
            </button>
          </form>
        </div>
      </div>

      {/* Bottom right footer */}
      <div className='fixed bottom-4 right-4 flex items-center gap-3'>
        <select
          value={lang}
          onChange={(e) => setLang(e.target.value)}
          className='text-sm text-gray-500 bg-transparent border-none outline-none cursor-pointer hover:text-gray-700 transition-colors'
        >
          {SUPPORTED_LANGS.map((l) => (
            <option key={l} value={l}>{LANG_NAMES[l] ?? l.toUpperCase()}</option>
          ))}
        </select>
        <span className='text-gray-300'>|</span>
        <a
          href='https://codeberg.org/TobTobXX/groupquiz'
          target='_blank'
          rel='noopener noreferrer'
          className='text-sm text-gray-500 hover:text-gray-700 transition-colors'
        >
          {t('footer.source')}
        </a>
        <span className='text-gray-300'>|</span>
        <button
          disabled
          className='text-sm text-gray-400 cursor-not-allowed'
          title={t('footer.donateTitle')}
        >
          {t('footer.donate')}
        </button>
      </div>

    </div>
  )
}
