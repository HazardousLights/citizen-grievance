import React, { useState, useEffect } from 'react'
import { submitGrievance, listMyGrievances } from '../services/api.js'
import { isValidComplaintText, VALID_COMPLAINT_EXAMPLE, INVALID_COMPLAINT_EXAMPLES } from '../utils/validators.js'

const STATUS_COLORS = {
  unsolved: 'bg-yellow-100 text-yellow-800',
  in_progress: 'bg-blue-100 text-blue-800',
  solved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
}

export default function GrievanceForm({ showToast }) {
  const [text, setText] = useState('')
  const [location, setLocation] = useState('')
  const [image, setImage] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [grievances, setGrievances] = useState([])
  const [rejectedCount, setRejectedCount] = useState(0)

  const loadGrievances = () => {
    listMyGrievances()
      .then((res) => setGrievances(res.data))
      .catch(() => {})
  }

  useEffect(() => {
    loadGrievances()
  }, [])

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setError('Geolocation not supported by this browser. Enter location manually.')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setLocation(`${pos.coords.latitude.toFixed(5)},${pos.coords.longitude.toFixed(5)}`),
      () => setError('Could not fetch your location. Enter it manually.')
    )
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!isValidComplaintText(text)) {
      setError('Complaint must be between 20 and 2000 characters.')
      return
    }

    const formData = new FormData()
    formData.append('text', text)
    if (location) formData.append('location', location)
    if (image) formData.append('image', image)

    setLoading(true)
    try {
      await submitGrievance(formData)
      showToast('Complaint submitted and classified successfully')
      setText('')
      setLocation('')
      setImage(null)
      setRejectedCount(0)
      loadGrievances()
    } catch (err) {
      const detail = err.response?.data?.detail || 'Submission failed. Please try again.'
      setError(detail)
      if (err.response?.status === 422) setRejectedCount((c) => c + 1)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="bg-white rounded-xl shadow p-6">
        <h2 className="text-lg font-semibold mb-4">Submit a grievance</h2>

        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-4 text-xs text-gray-600 space-y-1">
          <p><span className="font-medium text-green-700">✓ Good:</span> "{VALID_COMPLAINT_EXAMPLE}"</p>
          {INVALID_COMPLAINT_EXAMPLES.map((ex) => (
            <p key={ex}><span className="font-medium text-red-700">✗ Avoid:</span> "{ex}"</p>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Complaint details ({text.trim().length}/2000)
            </label>
            <textarea
              rows={5}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Describe the civic issue in detail — what, where, and how long it's been a problem."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Address or GPS coordinates"
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-500 focus:outline-none"
              />
              <button type="button" onClick={useMyLocation} className="px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg whitespace-nowrap">
                📍 Use GPS
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Photo (optional)</label>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => setImage(e.target.files?.[0] || null)}
              className="w-full text-sm"
            />
          </div>

          {rejectedCount >= 2 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
              ⚠️ CAPTCHA verification would appear here after repeated rejections in production.
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white font-medium py-2.5 rounded-lg transition"
          >
            {loading ? 'Classifying…' : 'Submit complaint'}
          </button>
        </form>
      </div>

      <div className="bg-white rounded-xl shadow p-6">
        <h2 className="text-lg font-semibold mb-4">My complaints</h2>
        {grievances.length === 0 && <p className="text-sm text-gray-500">No complaints submitted yet.</p>}
        <ul className="space-y-3 max-h-[32rem] overflow-y-auto">
          {grievances.map((g) => (
            <li key={g.id} className="border border-gray-200 rounded-lg p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{g.category.replace('_', ' ')}</span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[g.status] || 'bg-gray-100 text-gray-700'}`}>
                  {g.status.replace('_', ' ')}
                </span>
              </div>
              <p className="text-sm text-gray-800 line-clamp-2">{g.text}</p>
              <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
                <span>Urgency {g.urgency_score}/10</span>
                {g.is_duplicate && <span className="text-orange-600">⚠ Similar complaint exists</span>}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
