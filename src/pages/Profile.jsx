import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import Header from '../components/Header'
import { useI18n } from '../context/I18nContext'

export default function Profile() {
  const { user } = useAuth()
  const { t } = useI18n()
  const [username, setUsername] = useState('')
  const [isPro, setIsPro] = useState(false)
  const [periodEnd, setPeriodEnd] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)
  const [upgrading, setUpgrading] = useState(false)
  const [upgradeError, setUpgradeError] = useState(null)
  const [checkoutSuccess, setCheckoutSuccess] = useState(false)
  const [cancelAtPeriodEnd, setCancelAtPeriodEnd] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState(null)
  const [cancelSuccess, setCancelSuccess] = useState(false)

  // Detect ?checkout=success from Stripe redirect and clear it from the URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('checkout') === 'success') {
      setCheckoutSuccess(true)
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  useEffect(() => {
    async function load() {
      const [{ data: profile }, { data: end }] = await Promise.all([
        supabase.from('profiles').select('username, is_pro, stripe_cancel_at_period_end').eq('id', user.id).single(),
        supabase.rpc('get_my_subscription_period_end'),
      ])

      if (profile) {
        setUsername(profile.username ?? '')
        setIsPro(profile.is_pro ?? false)
        setCancelAtPeriodEnd(profile.stripe_cancel_at_period_end ?? false)
      }
      setPeriodEnd(end ?? null)
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
      setMessage({ type: 'success', text: t('profile.usernameSaved') })
    }

    setSaving(false)
  }

  async function handleUpgrade() {
    setUpgrading(true)
    setUpgradeError(null)

    const { data: { session } } = await supabase.auth.getSession()
    const { data, error } = await supabase.functions.invoke('create-checkout-session', {
      headers: { Authorization: `Bearer ${session?.access_token}` },
    })

    if (error || !data?.url) {
      console.error('create-checkout-session failed:', error)
      setUpgradeError(t('profile.upgradeError'))
      setUpgrading(false)
      return
    }

    window.location.href = data.url
  }

  async function handleCancel() {
    setCancelling(true)
    setCancelError(null)

    const { data: { session } } = await supabase.auth.getSession()
    const { data, error } = await supabase.functions.invoke('cancel-subscription', {
      headers: { Authorization: `Bearer ${session?.access_token}` },
    })

    if (error || !data?.ok) {
      console.error('cancel-subscription failed:', error)
      setCancelError(t('profile.cancelError'))
      setCancelling(false)
      return
    }

    setCancelAtPeriodEnd(true)
    setCancelSuccess(true)
    setCancelling(false)
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <div className="flex-1 flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-sm flex flex-col gap-6">

          <h1 className="text-2xl font-bold text-gray-900 text-center">{t('profile.title')}</h1>

          {checkoutSuccess && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-amber-800 text-sm">
              {t('profile.checkoutSuccess')}
            </div>
          )}

          {loading ? (
            <p className="text-gray-500 text-center">{t('profile.loading')}</p>
          ) : (
            <>
              <form onSubmit={handleSave} className="flex flex-col gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('profile.username')}
                  </label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder={t('profile.usernamePlaceholder')}
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
                  {saving ? t('profile.saving') : t('profile.save')}
                </button>
              </form>

              <div className="border-t pt-6 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-gray-700">{t('profile.proStatus')}</span>
                    {isPro && periodEnd && (
                      <span className="text-xs text-gray-400">
                        {t(cancelAtPeriodEnd ? 'profile.cancelsOn' : 'profile.renewsOn', {
                          date: new Date(periodEnd).toLocaleDateString(undefined, {
                            year: 'numeric', month: 'short', day: 'numeric',
                          }),
                        })}
                      </span>
                    )}
                  </div>
                  <span className={`text-sm font-semibold px-2 py-0.5 rounded ${isPro ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>
                    {isPro ? t('profile.pro') : t('profile.free')}
                  </span>
                </div>

                {!isPro && (
                  <div className="flex flex-col gap-2">
                    <p className="text-sm text-gray-500">{t('profile.upgradeDesc')}</p>
                    <p className="text-xs font-medium text-gray-600">{t('profile.proIncludesTitle')}</p>
                    <ul className="text-sm text-gray-600 flex flex-col gap-1 pl-1">
                      <li className="flex items-center gap-2">
                        <span className="text-green-500 font-bold">✓</span>
                        {t('profile.proFeatureImages')}
                      </li>
                    </ul>
                    {upgradeError && (
                      <p className="text-red-400 text-sm">{upgradeError}</p>
                    )}
                    <button
                      onClick={handleUpgrade}
                      disabled={upgrading}
                      className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-white font-bold py-3 rounded-lg transition-colors"
                    >
                      {upgrading ? t('profile.upgrading') : t('profile.upgradeTitle')}
                    </button>
                  </div>
                )}

                {isPro && !cancelAtPeriodEnd && (
                  <div className="flex flex-col gap-2">
                    {cancelSuccess && (
                      <p className="text-green-500 text-sm">{t('profile.cancelSuccess')}</p>
                    )}
                    {cancelError && (
                      <p className="text-red-400 text-sm">{cancelError}</p>
                    )}
                    {!cancelSuccess && (
                      <button
                        onClick={handleCancel}
                        disabled={cancelling}
                        className="border border-gray-300 hover:border-gray-400 disabled:opacity-50 text-gray-600 hover:text-gray-800 font-medium py-2.5 rounded-lg transition-colors text-sm"
                      >
                        {cancelling ? t('profile.cancelling') : t('profile.cancelSubscription')}
                      </button>
                    )}
                  </div>
                )}

                {isPro && cancelAtPeriodEnd && (
                  <div className="flex flex-col gap-2">
                    <p className="text-sm text-gray-500">{t('profile.resubscribeDesc')}</p>
                    <p className="text-xs font-medium text-gray-600">{t('profile.proIncludesTitle')}</p>
                    <ul className="text-sm text-gray-600 flex flex-col gap-1 pl-1">
                      <li className="flex items-center gap-2">
                        <span className="text-green-500 font-bold">✓</span>
                        {t('profile.proFeatureImages')}
                      </li>
                    </ul>
                    {upgradeError && (
                      <p className="text-red-400 text-sm">{upgradeError}</p>
                    )}
                    <button
                      onClick={handleUpgrade}
                      disabled={upgrading}
                      className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-white font-bold py-3 rounded-lg transition-colors"
                    >
                      {upgrading ? t('profile.upgrading') : t('profile.resubscribeTitle')}
                    </button>
                  </div>
                )}
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  )
}
