import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Home from './pages/Home'
import Host from './pages/Host'
import Play from './pages/Play'
import Edit from './pages/Edit'
import Login from './pages/Login'
import Profile from './pages/Profile'
import Join from './pages/Join'

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
      <Route path="/host" element={<Host />} />
      <Route path="/join" element={<Join />} />
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
      <Route path="/library" element={<Navigate to="/host" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  )
}
