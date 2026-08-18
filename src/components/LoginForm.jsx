import React, { useState } from 'react'
import { login } from '../services/api.js'
import { isValidPhone } from '../utils/validators.js'

export default function LoginForm({ onSuccess, onSwitchToRegister, showToast }) {
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleDemoFill = (demoPhone, demoPass) => {
    setPhone(demoPhone)
    setPassword(demoPass)
    setError('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!isValidPhone(phone)) {
      setError('Enter a valid phone number (10-15 digits).')
      return
    }
    if (!password) {
      setError('Password is required.')
      return
    }

    setLoading(true)
    try {
      const res = await login(phone, password)
      localStorage.setItem('token', res.data.access_token)
      localStorage.setItem('role', res.data.role)
      showToast('Logged in successfully')
      onSuccess(res.data.role)
    } catch (err) {
      setError(err.response?.data?.detail || 'Login failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-md mx-auto mt-10 bg-white rounded-xl shadow p-8">
      <h2 className="text-xl font-semibold mb-2">Sign in</h2>
      <p className="text-xs text-gray-500 mb-6">Citizen & Administrator Portal</p>

      {/* Quick Demo Fill Buttons for Preview Testing */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3.5 mb-6 text-xs text-blue-900">
        <p className="font-semibold mb-2">Seed Database Accounts (Password: Password123):</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => handleDemoFill('+919876543220', 'Password123')}
            className="px-2.5 py-1.5 bg-blue-700 hover:bg-blue-800 text-white rounded font-medium transition cursor-pointer"
          >
            👮 Admin (+919876543220)
          </button>
          <button
            type="button"
            onClick={() => handleDemoFill('+919876543210', 'Password123')}
            className="px-2.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded font-medium transition cursor-pointer"
          >
            👤 Priya Sharma (+919876543210)
          </button>
          <button
            type="button"
            onClick={() => handleDemoFill('+919876543211', 'Password123')}
            className="px-2.5 py-1.5 bg-slate-700 hover:bg-slate-800 text-white rounded font-medium transition cursor-pointer"
          >
            👤 Arun Kumar (+919876543211)
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Phone number</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+919876543210"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-500 focus:outline-none"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white font-medium py-2.5 rounded-lg transition cursor-pointer"
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <p className="text-sm text-gray-500 mt-4 text-center">
        Don't have an account?{' '}
        <button onClick={onSwitchToRegister} className="text-brand-600 font-medium hover:underline">
          Register
        </button>
      </p>
    </div>
  )
}
