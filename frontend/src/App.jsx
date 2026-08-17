import React, { useState, useEffect, useCallback } from 'react'
import LoginForm from './components/LoginForm.jsx'
import RegisterForm from './components/RegisterForm.jsx'
import GrievanceForm from './components/GrievanceForm.jsx'
import AdminDashboard from './components/AdminDashboard.jsx'
import NotificationToast from './components/NotificationToast.jsx'
import { getMe } from './services/api.js'

export default function App() {
  const [view, setView] = useState(localStorage.getItem('token') ? 'loading' : 'login')
  const [user, setUser] = useState(null)
  const [toast, setToast] = useState(null)

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 4000)
  }, [])

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) {
      setView('login')
      return
    }
    getMe()
      .then((res) => {
        setUser(res.data)
        setView(res.data.role === 'admin' ? 'admin' : 'citizen')
      })
      .catch(() => {
        localStorage.removeItem('token')
        setView('login')
      })
  }, [])

  const handleAuthSuccess = (role) => {
    getMe().then((res) => {
      setUser(res.data)
      setView(role === 'admin' ? 'admin' : 'citizen')
    })
  }

  const logout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('role')
    setUser(null)
    setView('login')
  }

  return (
    <div className="min-h-screen">
      <header className="bg-brand-700 text-white px-6 py-4 flex items-center justify-between shadow">
        <h1 className="text-lg font-semibold">🏛️ Citizen Grievance Portal</h1>
        {user && (
          <div className="flex items-center gap-4 text-sm">
            <span className="opacity-90">{user.phone} · {user.role}</span>
            <button onClick={logout} className="bg-brand-600 hover:bg-brand-500 px-3 py-1.5 rounded-md transition">
              Logout
            </button>
          </div>
        )}
      </header>

      <main className="max-w-5xl mx-auto p-4 sm:p-6">
        {view === 'loading' && <p className="text-center text-gray-500 mt-10">Loading…</p>}

        {view === 'login' && (
          <LoginForm
            onSuccess={handleAuthSuccess}
            onSwitchToRegister={() => setView('register')}
            showToast={showToast}
          />
        )}

        {view === 'register' && (
          <RegisterForm
            onSuccess={handleAuthSuccess}
            onSwitchToLogin={() => setView('login')}
            showToast={showToast}
          />
        )}

        {view === 'citizen' && <GrievanceForm showToast={showToast} />}

        {view === 'admin' && <AdminDashboard showToast={showToast} />}
      </main>

      <NotificationToast toast={toast} />
    </div>
  )
}
