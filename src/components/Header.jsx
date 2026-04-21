import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useI18n } from '../context/I18nContext'

// Shared header bar — appears on all pages except Play and HostSession during active game.
export default function Header() {
  const { user, loading, profile, signOut } = useAuth()
  const navigate = useNavigate()
  const { t } = useI18n()

  const displayName = profile?.username || user?.email

  return (
    <header className="flex items-center gap-4 px-6 py-4">
      {/* Left: logo + library link */}
      <Link to="/" className="text-4xl font-bold text-gray-900 hover:text-gray-700 transition-colors">
        Groupquiz
      </Link>
      <Link
        to="/browse"
        className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
      >
        {t('header.browse')}
      </Link>
      <Link
        to="/library"
        className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
      >
        {t('header.library')}
      </Link>

      {/* Spacer */}
      <div className="flex-1" />

       {/* Right: auth controls */}
       <button
         onClick={() => (user ? navigate('/edit') : navigate('/login'))}
         className="text-sm bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-4 py-1.5 rounded-lg transition-colors"
       >
         {t('header.create')}
       </button>

       {!loading && !user && (
         <button
           onClick={() => navigate('/login')}
           className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
         >
           {t('header.login')}
         </button>
       )}
       {!loading && user && (
         <>
           <Link
             to="/profile"
             className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
           >
             {displayName}
           </Link>
           <button
             onClick={signOut}
             className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
           >
             {t('header.logout')}
           </button>
         </>
       )}
    </header>
  )
}
