import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { I18nProvider } from './context/I18nContext'
import Home from './pages/Home'
import Library from './pages/Library'
import Host from './pages/Host'
import Browse from './pages/Browse'
import Play from './pages/Play'
import Edit from './pages/Edit'
import Login from './pages/Login'
import Profile from './pages/Profile'
import Join from './pages/Join'
import Faq from './pages/Faq'

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return null
  if (!user) return <Navigate to="/login" replace />
  return children
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/library" element={<Library />} />
      <Route path="/host" element={<Host />} />
      <Route path="/browse" element={<Browse />} />
      <Route path="/join" element={<Join />} />
      <Route path="/faq" element={<Faq />} />
      <Route path="/play" element={<Play />} />
      <Route
        path="/edit"
        element={
          <ProtectedRoute>
            <Edit />
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <Profile />
          </ProtectedRoute>
        }
      />
    </Routes>
  )
}

function VersionBadge() {
  const { pathname } = useLocation()
  if (pathname === '/play' || pathname === '/host') return null
  return (
    <div className="fixed bottom-2 left-3 text-xs text-gray-400 select-none pointer-events-none">
      {__APP_VERSION__}
    </div>
  )
}

export default function App() {
  return (
    <I18nProvider>
      <AuthProvider>
        <AppRoutes />
        <VersionBadge />
      </AuthProvider>
    </I18nProvider>
  )
}
