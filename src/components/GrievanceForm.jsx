import React, { useState, useEffect } from 'react'
import {
  submitGrievance,
  listMyGrievances,
  analyzeGrievanceImage,
  reverseGeocode,
  getGrievance,
  getMyNotifications,
} from '../services/api.js'
import { isValidComplaintText, VALID_COMPLAINT_EXAMPLE, INVALID_COMPLAINT_EXAMPLES } from '../utils/validators.js'

const STATUS_COLORS = {
  unsolved: 'bg-amber-100 text-amber-800 border-amber-300',
  in_progress: 'bg-blue-100 text-blue-800 border-blue-300',
  solved: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  rejected: 'bg-rose-100 text-rose-800 border-rose-300',
}

const CATEGORY_ICONS = {
  water_supply: '💧',
  electricity: '⚡',
  roads: '🛣️',
  sanitation: '🚯',
  public_safety: '🛡️',
  street_lights: '💡',
  garbage_waste: '🗑️',
  out_of_scope: '❓',
}

export default function GrievanceForm({ showToast }) {
  const [text, setText] = useState('')
  const [location, setLocation] = useState('')
  const [placeName, setPlaceName] = useState('')
  const [image, setImage] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [analyzingImage, setAnalyzingImage] = useState(false)
  const [geocoding, setGeocoding] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [grievances, setGrievances] = useState([])
  const [notifications, setNotifications] = useState([])
  const [selectedGrievance, setSelectedGrievance] = useState(null)
  const [rejectedCount, setRejectedCount] = useState(0)
  const [activeTab, setActiveTab] = useState('submit') // 'submit' | 'history' | 'notifications'

  const loadData = () => {
    listMyGrievances()
      .then((res) => setGrievances(res.data))
      .catch(() => {})

    getMyNotifications()
      .then((res) => setNotifications(res.data))
      .catch(() => {})
  }

  useEffect(() => {
    loadData()
  }, [])

  // Auto-reverse geocode coordinates whenever coordinates change (e.g., 12.84240, 80.15720)
  const handleLocationBlurOrChange = async (val) => {
    setLocation(val)
    const coordMatch = val.match(/^(-?\d+(\.\d+)?)\s*,\s*(-?\d+(\.\d+)?)$/)
    if (coordMatch) {
      const lat = parseFloat(coordMatch[1])
      const lon = parseFloat(coordMatch[3])
      setGeocoding(true)
      try {
        const res = await reverseGeocode(lat, lon)
        if (res.data?.place_name) {
          setPlaceName(res.data.place_name)
          showToast(`📍 Found Place: ${res.data.short_name || res.data.place_name}`)
        }
      } catch {
        // quiet fallback
      } finally {
        setGeocoding(false)
      }
    } else {
      setPlaceName('')
    }
  }

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setError('Geolocation not supported by this browser. Enter location manually.')
      return
    }
    setGeocoding(true)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude
        const lon = pos.coords.longitude
        const coordStr = `${lat.toFixed(5)},${lon.toFixed(5)}`
        setLocation(coordStr)
        try {
          const res = await reverseGeocode(lat, lon)
          if (res.data?.place_name) {
            setPlaceName(res.data.place_name)
            showToast(`📍 Detected Place: ${res.data.short_name}`)
          }
        } catch {
          // ignore
        } finally {
          setGeocoding(false)
        }
      },
      () => {
        setGeocoding(false)
        setError('Could not fetch GPS location. Enter it manually.')
      },
      { timeout: 8000 }
    )
  }

  // AI-Based Photo Upload & Automatic Grievance Draft Generation
  const handleImageChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    setImage(file)
    setImagePreview(URL.createObjectURL(file))
    setError('')

    // Automatically ask AI to analyze the photo and draft grievance text
    const formData = new FormData()
    formData.append('image', file)

    setAnalyzingImage(true)
    try {
      const res = await analyzeGrievanceImage(formData)
      if (res.data) {
        if (!res.data.is_valid_civic_issue) {
          showToast('⚠️ Image may not be civic infrastructure. Please review.', 'error')
        } else {
          showToast('✨ AI generated grievance draft from your uploaded photo!')
        }
        if (res.data.generated_complaint_text && (!text || text.length < 20)) {
          setText(res.data.generated_complaint_text)
        }
      }
    } catch {
      showToast('Photo uploaded. Add description details manually if needed.', 'info')
    } finally {
      setAnalyzingImage(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!isValidComplaintText(text)) {
      setError('Complaint text must be between 20 and 2000 characters.')
      return
    }

    const finalLocation = placeName ? `${placeName} (${location})` : location

    const formData = new FormData()
    formData.append('text', text)
    if (finalLocation) formData.append('location', finalLocation)
    if (image) formData.append('image', image)

    setLoading(true)
    try {
      const res = await submitGrievance(formData)
      showToast(`Complaint submitted! AI classified as ${res.data.category} (Urgency: ${res.data.urgency_score}/10)`)
      setText('')
      setLocation('')
      setPlaceName('')
      setImage(null)
      setImagePreview(null)
      setRejectedCount(0)
      loadData()
      setActiveTab('history')
    } catch (err) {
      const detail = err.response?.data?.detail || 'Submission failed. Please check inputs.'
      setError(detail)
      if (err.response?.status === 422) {
        setRejectedCount((c) => c + 1)
      }
    } finally {
      setLoading(false)
    }
  }

  const viewGrievanceDetails = async (id) => {
    try {
      const res = await getGrievance(id)
      setSelectedGrievance(res.data)
    } catch {
      showToast('Could not load grievance details', 'error')
    }
  }

  return (
    <div className="space-y-6">
      {/* Navigation tabs for Citizen */}
      <div className="flex border-b border-gray-200 bg-white rounded-t-xl px-4 pt-3 gap-4">
        <button
          onClick={() => setActiveTab('submit')}
          className={`pb-3 text-sm font-semibold border-b-2 transition ${
            activeTab === 'submit' ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          ✍️ Submit New Grievance
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`pb-3 text-sm font-semibold border-b-2 transition flex items-center gap-2 ${
            activeTab === 'history' ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          📋 My Complaints
          <span className="bg-gray-100 text-gray-700 text-xs px-2 py-0.5 rounded-full font-medium">{grievances.length}</span>
        </button>
        <button
          onClick={() => setActiveTab('notifications')}
          className={`pb-3 text-sm font-semibold border-b-2 transition flex items-center gap-2 ${
            activeTab === 'notifications' ? 'border-brand-600 text-brand-700' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          🔔 SMS & Status Notices
          <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full font-medium">{notifications.length}</span>
        </button>
      </div>

      {activeTab === 'submit' && (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 bg-white rounded-xl shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Submit Civic Grievance</h2>
            <p className="text-xs text-gray-500 mb-4">
              AI automatically classifies your grievance, scores urgency (1-10), assigns department, and alerts authorities.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Photo Upload with AI Image Classification */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  📸 Upload Grievance Photo (AI will auto-analyze and draft complaint)
                </label>
                <div className="border-2 border-dashed border-gray-300 rounded-xl p-4 text-center hover:border-brand-500 transition bg-gray-50/50">
                  <input
                    type="file"
                    id="complaint-photo-input"
                    accept="image/*"
                    onChange={handleImageChange}
                    className="hidden"
                  />
                  <label
                    htmlFor="complaint-photo-input"
                    className="cursor-pointer inline-flex flex-col items-center justify-center"
                  >
                    <span className="text-2xl mb-1">📷</span>
                    <span className="text-sm font-medium text-brand-600 hover:underline">
                      Click to snap or upload a photo
                    </span>
                    <span className="text-xs text-gray-500 mt-0.5">JPG, PNG or WEBP (road damage, water leak, garbage, etc.)</span>
                  </label>

                  {analyzingImage && (
                    <div className="mt-3 bg-blue-50 border border-blue-200 rounded-lg p-2.5 text-xs text-blue-800 flex items-center justify-center gap-2">
                      <span className="animate-spin text-base">⚙️</span>
                      <span>AI Multimodal Vision analyzing photo & drafting grievance text…</span>
                    </div>
                  )}

                  {imagePreview && (
                    <div className="mt-3 flex items-center justify-center gap-3">
                      <img
                        src={imagePreview}
                        alt="Uploaded preview"
                        className="h-24 w-28 object-cover rounded-lg border border-gray-200 shadow-sm"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setImage(null)
                          setImagePreview(null)
                        }}
                        className="text-xs text-rose-600 hover:underline"
                      >
                        Remove Photo
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Complaint Text */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-sm font-medium text-gray-700">Complaint Details</label>
                  <span className={`text-xs ${text.trim().length < 20 ? 'text-amber-600' : 'text-emerald-600'}`}>
                    {text.trim().length} / 2000 chars (min 20)
                  </span>
                </div>
                <textarea
                  rows={4}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Describe what the issue is, exact landmark, and how long it has persisted. Example: A water main leak opposite the school on Anna Salai is flooding the street."
                  className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-brand-500 focus:outline-none"
                />
              </div>

              {/* Location with Coordinates & Place Name Reverse Geocoding */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  📍 Location & Place Name
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => handleLocationBlurOrChange(e.target.value)}
                    placeholder="e.g. 12.84240,80.15720 or Anna Nagar East, Chennai"
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={useMyLocation}
                    disabled={geocoding}
                    className="px-3.5 py-2 text-xs font-semibold bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg whitespace-nowrap transition cursor-pointer flex items-center gap-1.5"
                  >
                    {geocoding ? 'Locating…' : '📍 Use GPS'}
                  </button>
                </div>

                {/* Detected Place Box */}
                {placeName && (
                  <div className="mt-2 p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-900 flex items-start gap-2">
                    <span className="text-base">📌</span>
                    <div>
                      <p className="font-semibold">Resolved Place Address:</p>
                      <p className="text-emerald-800">{placeName}</p>
                    </div>
                  </div>
                )}
              </div>

              {rejectedCount >= 2 && (
                <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 text-xs text-amber-900 flex items-start gap-2">
                  <span>⚠️</span>
                  <div>
                    <p className="font-semibold">Anti-Abuse Notice (CAPTCHA)</p>
                    <p>
                      Multiple out-of-scope complaints were rejected. Please verify you are reporting municipal public
                      infrastructure issues to keep your reputation score intact.
                    </p>
                  </div>
                </div>
              )}

              {error && (
                <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 text-xs text-rose-800">
                  <p className="font-semibold mb-0.5">Submission Error</p>
                  <p>{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading || analyzingImage}
                className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white font-medium py-3 rounded-lg transition cursor-pointer shadow flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <span className="animate-spin">⚙️</span> AI Classifier Grading & Assigning…
                  </>
                ) : (
                  '🚀 Submit Grievance for AI Triage'
                )}
              </button>
            </form>
          </div>

          {/* Side Guidance & Valid vs Invalid examples */}
          <div className="space-y-4">
            <div className="bg-white rounded-xl shadow p-5 border border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900 mb-2">📋 Real-Time Validation Guide</h3>
              <div className="space-y-3 text-xs">
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-emerald-900">
                  <p className="font-semibold mb-1">✓ Valid Civic Issues (Auto-assigned):</p>
                  <p className="italic">"{VALID_COMPLAINT_EXAMPLE}"</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {['Water Supply', 'Electricity', 'Roads/Potholes', 'Sanitation', 'Street Lights', 'Garbage Waste', 'Public Safety'].map((c) => (
                      <span key={c} className="bg-white text-emerald-800 px-2 py-0.5 rounded border border-emerald-200">
                        {c}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 text-rose-900">
                  <p className="font-semibold mb-1">✗ Out-of-Scope (Auto-rejected by AI):</p>
                  <ul className="list-disc list-inside space-y-1 text-rose-800">
                    <li>Personal theft / crimes → Dial 100 / Police FIR</li>
                    <li>Job / employment requests → Employment Exchange</li>
                    <li>Private landlord / tenant civil disputes</li>
                    <li>Political party opinions</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-xs text-blue-900">
              <h4 className="font-semibold mb-1">🤖 AI Classifier Capabilities:</h4>
              <ul className="list-disc list-inside space-y-1 text-blue-800">
                <li>Urgency graded 1-10 based on hazard severity</li>
                <li>Semantic duplicate cluster detection</li>
                <li>Instant SMS notices upon status changes</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'history' && (
        <div className="bg-white rounded-xl shadow p-6">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">My Registered Grievances</h2>
              <p className="text-xs text-gray-500">Track real-time progress, progress photos, and department assignment</p>
            </div>
            <button
              onClick={loadData}
              className="text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700 transition cursor-pointer"
            >
              🔄 Refresh List
            </button>
          </div>

          {grievances.length === 0 ? (
            <div className="text-center py-12 text-gray-500 text-sm">
              <p className="text-3xl mb-2">📭</p>
              <p>You have not submitted any complaints yet.</p>
              <button
                onClick={() => setActiveTab('submit')}
                className="mt-3 px-4 py-2 bg-brand-600 text-white rounded-lg text-xs font-semibold hover:bg-brand-700 cursor-pointer"
              >
                Submit First Grievance
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {grievances.map((g) => (
                <div
                  key={g.id}
                  className="border border-gray-200 hover:border-brand-400 rounded-xl p-4 transition bg-white shadow-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{CATEGORY_ICONS[g.category] || '🏛️'}</span>
                      <span className="font-semibold text-sm text-gray-900 uppercase tracking-wide">
                        {g.category?.replace('_', ' ')}
                      </span>
                      <span className="text-xs text-gray-500">· {g.department || 'Assigned'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs font-semibold px-3 py-1 rounded-full border whitespace-nowrap inline-flex items-center gap-1 ${
                          STATUS_COLORS[g.status] || 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {g.status?.replace('_', ' ').toUpperCase()}
                      </span>
                      <button
                        onClick={() => viewGrievanceDetails(g.id)}
                        className="text-xs bg-brand-50 hover:bg-brand-100 text-brand-700 px-3 py-1 rounded-md font-medium transition cursor-pointer"
                      >
                        View Timeline & Updates
                      </button>
                    </div>
                  </div>

                  <p className="text-sm text-gray-800 mb-3">{g.text}</p>

                  <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-gray-500 pt-2 border-t border-gray-100">
                    <div className="flex items-center gap-3">
                      <span className="font-medium text-gray-700">
                        ⚡ Urgency Score: <strong className="text-brand-700">{g.urgency_score}/10</strong>
                      </span>
                      {g.location && <span>📍 {g.location}</span>}
                    </div>
                    <div>
                      {g.is_duplicate && (
                        <span className="text-amber-700 font-semibold bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                          ⚠️ Grouped with similar complaints in your area
                        </span>
                      )}
                      <span className="ml-3 text-gray-400">
                        {new Date(g.created_at).toLocaleDateString()} {new Date(g.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'notifications' && (
        <div className="bg-white rounded-xl shadow p-6">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">SMS & Notification Feed</h2>
              <p className="text-xs text-gray-500">Every single step sends automated alerts to your mobile number</p>
            </div>
            <button
              onClick={loadData}
              className="text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700 transition cursor-pointer"
            >
              🔄 Refresh
            </button>
          </div>

          {notifications.length === 0 ? (
            <p className="text-center py-10 text-gray-500 text-sm">No notification alerts yet.</p>
          ) : (
            <div className="space-y-3">
              {notifications.map((n) => (
                <div key={n.id} className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl flex items-start gap-3">
                  <span className="text-lg mt-0.5">💬</span>
                  <div className="flex-1">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs font-semibold text-blue-950 uppercase tracking-wider">SMS Dispatch</span>
                      <span className="text-xs text-gray-500">
                        {new Date(n.created_at || n.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-sm text-gray-800">{n.message}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal: View Grievance Progress Timeline & Progress Photos */}
      {selectedGrievance && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl">
            <div className="flex justify-between items-start mb-4">
              <div>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${STATUS_COLORS[selectedGrievance.status]}`}>
                  {selectedGrievance.status?.replace('_', ' ').toUpperCase()}
                </span>
                <h3 className="text-lg font-bold text-gray-900 mt-2">
                  {selectedGrievance.category?.replace('_', ' ')} · {selectedGrievance.department}
                </h3>
              </div>
              <button
                onClick={() => setSelectedGrievance(null)}
                className="text-gray-400 hover:text-gray-700 text-xl font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-sm text-gray-800 bg-gray-50 p-3 rounded-lg mb-4">{selectedGrievance.text}</p>

            {selectedGrievance.location && (
              <p className="text-xs text-gray-600 mb-3">📍 Location: {selectedGrievance.location}</p>
            )}

            {selectedGrievance.image_url && (
              <div className="mb-4">
                <p className="text-xs font-semibold text-gray-700 mb-1">Uploaded Complaint Photo:</p>
                <img
                  src={selectedGrievance.image_url}
                  alt="Complaint evidence"
                  className="h-44 object-cover rounded-lg border border-gray-200"
                />
              </div>
            )}

            {/* Audit updates timeline with progress photos */}
            <div className="border-t border-gray-200 pt-4 mt-4">
              <h4 className="text-sm font-semibold text-gray-900 mb-3">🛠️ Resolution Progress Timeline:</h4>
              {selectedGrievance.updates?.length === 0 ? (
                <p className="text-xs text-gray-500 italic">No field team notes logged yet. Investigation scheduled.</p>
              ) : (
                <div className="space-y-3 relative before:absolute before:inset-0 before:left-3 before:w-0.5 before:bg-gray-200">
                  {selectedGrievance.updates?.map((up) => (
                    <div key={up.id} className="relative pl-8">
                      <div className="absolute left-1.5 top-1.5 w-3.5 h-3.5 rounded-full bg-brand-600 border-2 border-white" />
                      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs">
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-semibold text-gray-800 uppercase">{up.status}</span>
                          <span className="text-gray-500">{new Date(up.timestamp).toLocaleString()}</span>
                        </div>
                        {up.message && <p className="text-gray-700">{up.message}</p>}
                        {up.progress_image_url && (
                          <div className="mt-2">
                            <p className="text-xs font-medium text-emerald-800 mb-1">📸 Field Progress Photo:</p>
                            <img
                              src={up.progress_image_url}
                              alt="Progress"
                              className="h-32 object-cover rounded border border-gray-300"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setSelectedGrievance(null)}
                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg text-xs font-semibold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
