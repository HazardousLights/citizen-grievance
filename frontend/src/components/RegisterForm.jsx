import React, { useState } from 'react'
import { sendOtp, verifyOtp, register } from '../services/api.js'
import { isValidPhone, isValidPassword } from '../utils/validators.js'

// Three-step flow: (1) enter phone -> send OTP, (2) verify OTP, (3) set password -> register.
export default function RegisterForm({ onSuccess, onSwitchToLogin, showToast }) {
  const [step, setStep] = useState(1)
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSendOtp = async (e) => {
    e.preventDefault()
    setError('')
    if (!isValidPhone(phone)) {
      setError('Enter a valid phone number (10-15 digits).')
      return
    }
    setLoading(true)
    try {
      await sendOtp(phone)
      showToast('OTP sent to your phone')
      setStep(2)
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not send OTP.')
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyOtp = async (e) => {
    e.preventDefault()
    setError('')
    if (otp.length !== 6) {
      setError('OTP must be 6 digits.')
      return
    }
    setLoading(true)
    try {
      await verifyOtp(phone, otp)
      showToast('Phone verified')
      setStep(3)
    } catch (err) {
      setError(err.response?.data?.detail || 'OTP verification failed.')
    } finally {
      setLoading(false)
    }
  }

  const handleRegister = async (e) => {
    e.preventDefault()
    setError('')
    if (!isValidPassword(password)) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    setLoading(true)
    try {
      const res = await register(phone, password)
      localStorage.setItem('token', res.data.access_token)
      localStorage.setItem('role', res.data.role)
      showToast('Account created successfully')
      onSuccess(res.data.role)
    } catch (err) {
      setError(err.response?.data?.detail || 'Registration failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-md mx-auto mt-10 bg-white rounded-xl shadow p-8">
      <h2 className="text-xl font-semibold mb-1">Create an account</h2>
      <p className="text-sm text-gray-500 mb-6">Step {step} of 3</p>

      {step === 1 && (
        <form onSubmit={handleSendOtp} className="space-y-4">
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
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" disabled={loading} className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white font-medium py-2.5 rounded-lg transition">
            {loading ? 'Sending…' : 'Send OTP'}
          </button>
        </form>
      )}

      {step === 2 && (
        <form onSubmit={handleVerifyOtp} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Enter the 6-digit OTP</label>
            <input
              type="text"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 tracking-widest text-center focus:ring-2 focus:ring-brand-500 focus:outline-none"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" disabled={loading} className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white font-medium py-2.5 rounded-lg transition">
            {loading ? 'Verifying…' : 'Verify OTP'}
          </button>
        </form>
      )}

      {step === 3 && (
        <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Confirm password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-500 focus:outline-none"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" disabled={loading} className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white font-medium py-2.5 rounded-lg transition">
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>
      )}

      <p className="text-sm text-gray-500 mt-4 text-center">
        Already have an account?{' '}
        <button onClick={onSwitchToLogin} className="text-brand-600 font-medium hover:underline">
          Sign in
        </button>
      </p>
    </div>
  )
}
