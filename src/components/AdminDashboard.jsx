import React, { useState, useEffect, useCallback } from 'react'
import {
  listAllGrievances,
  getDuplicateClusters,
  updateClusterStatus,
  updateGrievanceStatus,
  uploadProgressPhoto,
  reclassifyGrievance,
  getAnalytics,
  getGrievance,
} from '../services/api.js'

const CATEGORIES = [
  'water_supply',
  'electricity',
  'roads',
  'sanitation',
  'public_safety',
  'street_lights',
  'garbage_waste',
  'out_of_scope',
]
const STATUSES = ['unsolved', 'in_progress', 'solved', 'rejected']

const STATUS_CONFIG = {
  unsolved: {
    label: 'UNSOLVED',
    bg: 'bg-amber-50 text-amber-800 border-amber-300 ring-1 ring-amber-300/30',
    dot: 'bg-amber-500',
  },
  in_progress: {
    label: 'IN PROGRESS',
    bg: 'bg-blue-50 text-blue-800 border-blue-300 ring-1 ring-blue-300/30',
    dot: 'bg-blue-500',
  },
  solved: {
    label: 'SOLVED',
    bg: 'bg-emerald-50 text-emerald-800 border-emerald-300 ring-1 ring-emerald-300/30',
    dot: 'bg-emerald-500',
  },
  rejected: {
    label: 'REJECTED',
    bg: 'bg-rose-50 text-rose-800 border-rose-300 ring-1 ring-rose-300/30',
    dot: 'bg-rose-500',
  },
}

const CATEGORY_MAP = {
  water_supply: 'Water Supply',
  electricity: 'Electricity',
  roads: 'Roads & Infrastructure',
  sanitation: 'Sanitation & Sewage',
  public_safety: 'Public Safety',
  street_lights: 'Street Lights',
  garbage_waste: 'Garbage & Waste',
  out_of_scope: 'Out of Scope',
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

export default function AdminDashboard({ showToast }) {
  const [activeTab, setActiveTab] = useState('all') // 'all' | 'clusters' | 'analytics'
  const [grievances, setGrievances] = useState([])
  const [clusters, setClusters] = useState([])
  const [analytics, setAnalytics] = useState(null)
  const [filters, setFilters] = useState({ category: '', status: '', min_urgency: '', search: '' })
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [selectedGrievance, setSelectedGrievance] = useState(null)

  // Status update modal state (for individual grievance)
  const [statusModalGrievance, setStatusModalGrievance] = useState(null)
  const [newStatus, setNewStatus] = useState('in_progress')
  const [statusNote, setStatusNote] = useState('')
  const [progressPhoto, setProgressPhoto] = useState(null)
  const [updateClusterCascade, setUpdateClusterCascade] = useState(true)
  const [updatingStatus, setUpdatingStatus] = useState(false)

  // Cluster bulk resolution modal state
  const [clusterModalTarget, setClusterModalTarget] = useState(null)
  const [clusterNewStatus, setClusterNewStatus] = useState('in_progress')
  const [clusterNote, setClusterNote] = useState('')
  const [clusterPhoto, setClusterPhoto] = useState(null)
  const [updatingCluster, setUpdatingCluster] = useState(false)

  // Expand full complaint text in table
  const [expandedTexts, setExpandedTexts] = useState({})
  const toggleExpandText = (id) => {
    setExpandedTexts((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const loadData = useCallback(() => {
    setLoading(true)
    const params = {}
    if (filters.category) params.category = filters.category
    if (filters.status) params.status = filters.status
    if (filters.min_urgency) params.min_urgency = filters.min_urgency

    Promise.all([listAllGrievances(params), getDuplicateClusters(), getAnalytics()])
      .then(([gRes, cRes, aRes]) => {
        let list = gRes.data || []
        if (filters.search) {
          const s = filters.search.toLowerCase()
          list = list.filter(
            (g) =>
              g.text.toLowerCase().includes(s) ||
              (g.location && g.location.toLowerCase().includes(s)) ||
              (g.department && g.department.toLowerCase().includes(s)) ||
              (g.user_phone && g.user_phone.toLowerCase().includes(s)) ||
              (g.user_email && g.user_email.toLowerCase().includes(s))
          )
        }
        setGrievances(list)
        setClusters(cRes.data || [])
        setAnalytics(aRes.data)
      })
      .catch(() => showToast?.('Failed to load dashboard data', 'error'))
      .finally(() => setLoading(false))
  }, [filters, showToast])

  useEffect(() => {
    loadData()
  }, [loadData])

  const openStatusUpdateModal = (g) => {
    setStatusModalGrievance(g)
    setNewStatus(g.status)
    setStatusNote('')
    setProgressPhoto(null)
    setUpdateClusterCascade(g.is_duplicate)
  }

  const handleSaveStatusWithPhoto = async (e) => {
    e.preventDefault()
    if (!statusModalGrievance) return

    setUpdatingStatus(true)
    try {
      let progressImageUrl = null
      if (progressPhoto) {
        const formData = new FormData()
        formData.append('progress_image', progressPhoto)
        const photoRes = await uploadProgressPhoto(statusModalGrievance.id, formData)
        progressImageUrl = photoRes.data?.progress_image_url
      }

      const res = await updateGrievanceStatus(statusModalGrievance.id, {
        status: newStatus,
        message: statusNote || `Status updated to ${newStatus.toUpperCase()}`,
        progress_image_url: progressImageUrl,
        update_cluster: updateClusterCascade,
      })

      const notifiedCount = res.data?.notified_citizens?.length || 1
      showToast(`Status updated to ${newStatus.toUpperCase()}! SMS dispatched to ${notifiedCount} citizen(s).`)
      setStatusModalGrievance(null)
      loadData()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Update failed', 'error')
    } finally {
      setUpdatingStatus(false)
    }
  }

  const handleClusterBulkUpdate = async (e) => {
    e.preventDefault()
    if (!clusterModalTarget) return

    setUpdatingCluster(true)
    try {
      let progressImageUrl = null
      if (clusterPhoto) {
        const formData = new FormData()
        formData.append('progress_image', clusterPhoto)
        const photoRes = await uploadProgressPhoto(clusterModalTarget.cluster_id, formData)
        progressImageUrl = photoRes.data?.progress_image_url
      }

      const res = await updateClusterStatus(clusterModalTarget.cluster_id, {
        status: clusterNewStatus,
        message: clusterNote || `Cluster resolved to ${clusterNewStatus.toUpperCase()}`,
        progress_image_url: progressImageUrl,
      })

      showToast(`Cluster updated! ${res.data?.message || 'SMS dispatched to all citizens in cluster.'}`)
      setClusterModalTarget(null)
      loadData()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Cluster update failed', 'error')
    } finally {
      setUpdatingCluster(false)
    }
  }

  const handleReclassify = async (id, category) => {
    try {
      await reclassifyGrievance(id, { category })
      showToast('Grievance reclassified & department reassigned')
      setEditing(null)
      loadData()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Reclassify failed', 'error')
    }
  }

  const viewDetails = async (id) => {
    try {
      const res = await getGrievance(id)
      setSelectedGrievance(res.data)
    } catch {
      showToast('Could not load grievance details', 'error')
    }
  }

  const totalDuplicateComplaints = clusters.reduce((acc, c) => acc + (c.complaints?.length || 0), 0)

  return (
    <div className="space-y-6">
      {/* Top Header / Analytics Overview Cards */}
      {analytics && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard
            label="Total Grievances"
            value={analytics.total_grievances}
            icon="📋"
            onClick={() => setActiveTab('all')}
          />
          <StatCard
            label="Duplicate Clusters"
            value={`${clusters.length} (${totalDuplicateComplaints} complaints)`}
            icon="👥"
            subtext="Click to inspect all merged groups"
            highlight={clusters.length > 0}
            onClick={() => setActiveTab('clusters')}
          />
          <StatCard
            label="Avg. Resolution Time"
            value={analytics.avg_resolution_hours ? `${analytics.avg_resolution_hours.toFixed(1)}h` : '—'}
            icon="⏱️"
            onClick={() => setActiveTab('analytics')}
          />
          <StatCard
            label="Solved Complaints"
            value={analytics.by_status?.solved || 0}
            icon="✅"
            subtext={`${analytics.by_status?.in_progress || 0} currently in progress`}
            onClick={() => {
              setFilters((f) => ({ ...f, status: 'solved' }))
              setActiveTab('all')
            }}
          />
        </div>
      )}

      {/* Main Admin Navigation Tabs */}
      <div className="flex border-b border-gray-200 bg-white rounded-t-xl px-4 pt-3 gap-3">
        <button
          onClick={() => setActiveTab('all')}
          className={`pb-3 text-sm font-semibold border-b-2 transition flex items-center gap-2 cursor-pointer ${
            activeTab === 'all'
              ? 'border-brand-600 text-brand-700'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <span>📋 All Grievances</span>
          <span className="bg-gray-100 text-gray-700 text-xs px-2 py-0.5 rounded-full font-medium">
            {grievances.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('clusters')}
          className={`pb-3 text-sm font-semibold border-b-2 transition flex items-center gap-2 cursor-pointer ${
            activeTab === 'clusters'
              ? 'border-brand-600 text-brand-700'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <span>👥 Duplicate Clusters & Multi-Filer Merges</span>
          <span className="bg-amber-100 text-amber-900 text-xs px-2 py-0.5 rounded-full font-bold border border-amber-300">
            {clusters.length} clusters ({totalDuplicateComplaints} reports)
          </span>
        </button>

        <button
          onClick={() => setActiveTab('analytics')}
          className={`pb-3 text-sm font-semibold border-b-2 transition flex items-center gap-2 cursor-pointer ${
            activeTab === 'analytics'
              ? 'border-brand-600 text-brand-700'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <span>📊 Department Analytics</span>
        </button>
      </div>

      {/* TAB 1: ALL GRIEVANCES TABLE */}
      {activeTab === 'all' && (
        <div className="space-y-4">
          {/* Filter and Search Bar */}
          <div className="bg-white rounded-xl shadow p-4 flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[15rem]">
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Search complaints, citizens, phone numbers or locations
              </label>
              <input
                type="text"
                placeholder="e.g. +91 98765 43210, water leak, Tambaram, Priya..."
                value={filters.search}
                onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:outline-none"
              />
            </div>

            <FilterSelect
              label="Category"
              value={filters.category}
              onChange={(v) => setFilters((f) => ({ ...f, category: v }))}
              options={CATEGORIES}
            />
            <FilterSelect
              label="Status"
              value={filters.status}
              onChange={(v) => setFilters((f) => ({ ...f, status: v }))}
              options={STATUSES}
            />
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Min urgency</label>
              <input
                type="number"
                min={1}
                max={10}
                value={filters.min_urgency}
                onChange={(e) => setFilters((f) => ({ ...f, min_urgency: e.target.value }))}
                placeholder="1-10"
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-20"
              />
            </div>
            <button
              onClick={loadData}
              className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-semibold cursor-pointer transition shadow-xs"
            >
              Apply Filters
            </button>
            {(filters.category || filters.status || filters.min_urgency || filters.search) && (
              <button
                onClick={() => setFilters({ category: '', status: '', min_urgency: '', search: '' })}
                className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-semibold cursor-pointer transition"
              >
                Clear
              </button>
            )}
          </div>

          {/* Grievance Table */}
          <div className="bg-white rounded-xl shadow overflow-x-auto border border-gray-200">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 text-left text-gray-700 border-b border-gray-200 text-xs font-semibold uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3.5 w-4/12 min-w-[18rem]">Complaint & Location</th>
                  <th className="px-4 py-3.5 w-2/12 min-w-[12rem]">Filer Contact & Identity</th>
                  <th className="px-4 py-3.5 w-2/12 min-w-[10rem]">Category & Dept</th>
                  <th className="px-3 py-3.5 text-center w-1/12 min-w-[5rem]">Urgency</th>
                  <th className="px-3 py-3.5 text-center w-1/12 min-w-[7rem]">Status</th>
                  <th className="px-3 py-3.5 text-center w-1/12 min-w-[7rem]">Duplicate Cluster</th>
                  <th className="px-5 py-3.5 text-right w-1/12 min-w-[11rem]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {loading && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-gray-500">
                      <span className="animate-spin inline-block mr-2">⚙️</span> Loading grievances...
                    </td>
                  </tr>
                )}
                {!loading && grievances.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-gray-500">
                      No grievances match the specified criteria.
                    </td>
                  </tr>
                )}
                {grievances.map((g) => {
                  const statusInfo = STATUS_CONFIG[g.status] || {
                    label: g.status?.toUpperCase(),
                    bg: 'bg-gray-100 text-gray-800 border-gray-300',
                    dot: 'bg-gray-400',
                  }

                  return (
                    <tr key={g.id} className="hover:bg-gray-50/80 transition align-top">
                      {/* Complaint Details & Location */}
                      <td className="px-5 py-3.5">
                        <div>
                          <p
                            className={`font-semibold text-gray-900 text-sm leading-snug break-words ${
                              expandedTexts[g.id] ? '' : 'line-clamp-2'
                            }`}
                          >
                            {g.text}
                          </p>
                          {g.text && g.text.length > 70 && (
                            <button
                              type="button"
                              onClick={() => toggleExpandText(g.id)}
                              className="text-[11px] font-bold text-brand-600 hover:text-brand-800 hover:underline mt-1 inline-flex items-center gap-1 cursor-pointer bg-brand-50 px-2 py-0.5 rounded border border-brand-200"
                            >
                              <span>{expandedTexts[g.id] ? '▲ Show less' : '▼ Read full complaint'}</span>
                            </button>
                          )}
                        </div>
                        {g.location && (
                          <p className="text-xs text-brand-700 font-medium mt-1.5 flex items-start gap-1">
                            <span className="shrink-0">📍</span>
                            <span className="break-words">{g.location}</span>
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className="text-[11px] text-gray-400">
                            #{g.id.slice(0, 6)} · {new Date(g.created_at).toLocaleDateString()}
                          </span>
                          {g.image_url && (
                            <span className="inline-flex items-center gap-0.5 text-[11px] bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded border border-gray-200">
                              📸 Photo Attached
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Filer Contact & Identity */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-gray-900">
                              {g.user_phone ? `📞 ${g.user_phone}` : '📞 Unverified'}
                            </span>
                          </div>
                          {g.user_email && <p className="text-xs text-gray-500 truncate max-w-[12rem]">{g.user_email}</p>}
                          <div className="flex items-center gap-1.5 pt-0.5">
                            <span className="text-[11px] font-medium bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded border border-gray-200">
                              Reputation: {g.user_reputation ?? 100}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* AI Category & Department */}
                      <td className="px-4 py-3.5">
                        {editing === g.id ? (
                          <select
                            defaultValue={g.category}
                            onChange={(e) => handleReclassify(g.id, e.target.value)}
                            className="border border-gray-300 rounded-lg px-2 py-1 text-xs bg-white"
                          >
                            {CATEGORIES.map((c) => (
                              <option key={c} value={c}>
                                {CATEGORY_MAP[c] || c}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <div>
                            <div className="flex items-center gap-1 font-semibold text-xs text-gray-900 uppercase">
                              <span>{CATEGORY_ICONS[g.category] || '🏛️'}</span>
                              <span>{g.category?.replace('_', ' ')}</span>
                            </div>
                            <p className="text-xs text-gray-500 mt-0.5">{g.department || 'General'}</p>
                          </div>
                        )}
                      </td>

                      {/* Urgency Score */}
                      <td className="px-3 py-3.5 text-center whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${
                            g.urgency_score >= 8
                              ? 'bg-rose-100 text-rose-800 border border-rose-200'
                              : g.urgency_score >= 5
                              ? 'bg-amber-100 text-amber-800 border border-amber-200'
                              : 'bg-gray-100 text-gray-700 border border-gray-200'
                          }`}
                        >
                          {g.urgency_score}/10
                        </span>
                      </td>

                      {/* Status Badge */}
                      <td className="px-3 py-3.5 text-center whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border whitespace-nowrap ${statusInfo.bg}`}
                        >
                          <span className={`w-2 h-2 rounded-full ${statusInfo.dot}`} />
                          <span>{statusInfo.label}</span>
                        </span>
                      </td>

                      {/* Duplicate Cluster Badge */}
                      <td className="px-3 py-3.5 text-center whitespace-nowrap">
                        {g.is_duplicate ? (
                          <button
                            onClick={() => {
                              const found = clusters.find(
                                (c) =>
                                  c.cluster_id === g.id ||
                                  c.complaints?.some((cmp) => cmp.id === g.id)
                              )
                              if (found) {
                                setClusterModalTarget(found)
                                setClusterNewStatus(found.status)
                              } else {
                                setActiveTab('clusters')
                              }
                            }}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-900 transition whitespace-nowrap cursor-pointer shadow-xs"
                            title="Click to view all merged complaints in this duplicate cluster"
                          >
                            <span>👥</span>
                            <span>Cluster ({g.similar_complaint_ids?.length ? g.similar_complaint_ids.length + 1 : 2})</span>
                          </button>
                        ) : (
                          <span className="text-gray-400 text-xs">—</span>
                        )}
                      </td>

                      {/* Action Buttons */}
                      <td className="px-5 py-3.5 text-right space-x-1.5 whitespace-nowrap">
                        <button
                          onClick={() => openStatusUpdateModal(g)}
                          className="text-xs bg-brand-600 hover:bg-brand-700 text-white px-3 py-1.5 rounded-lg font-semibold cursor-pointer shadow-xs transition"
                        >
                          Update Status & SMS
                        </button>
                        <button
                          onClick={() => viewDetails(g.id)}
                          className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-800 px-2.5 py-1.5 rounded-lg font-medium cursor-pointer transition"
                        >
                          Timeline
                        </button>
                        <button
                          onClick={() => setEditing(editing === g.id ? null : g.id)}
                          className="text-xs text-brand-600 hover:underline px-1 py-1"
                        >
                          {editing === g.id ? 'Cancel' : 'Reclassify'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: DUPLICATE CLUSTERS & MULTI-FILER MERGES */}
      {activeTab === 'clusters' && (
        <div className="space-y-4">
          <div className="bg-amber-50/80 border border-amber-200 rounded-xl p-4 text-xs text-amber-900 flex items-start gap-3 shadow-xs">
            <span className="text-2xl">👥</span>
            <div>
              <h3 className="font-bold text-sm text-amber-950 mb-0.5">
                AI Automated Duplicate Cluster Management
              </h3>
              <p className="leading-relaxed">
                When multiple citizens submit complaints regarding the exact same incident (e.g. an identical water
                main leak on Anna Salai or non-working street light in Adyar), the AI groups them into a single cluster.
                Updating or solving the issue here will automatically broadcast SMS notifications to <strong>every single citizen</strong> who reported it.
              </p>
            </div>
          </div>

          {clusters.length === 0 ? (
            <div className="bg-white rounded-xl shadow p-12 text-center text-gray-500">
              <p className="text-3xl mb-2">🎉</p>
              <p className="font-medium text-gray-800">No duplicate complaints currently detected.</p>
              <p className="text-xs text-gray-500 mt-1">All complaints filed are distinct issues across different locations.</p>
            </div>
          ) : (
            <div className="grid gap-5">
              {clusters.map((c, idx) => (
                <div
                  key={c.cluster_id || idx}
                  className="bg-white rounded-xl shadow border border-amber-200 overflow-hidden"
                >
                  {/* Cluster Header */}
                  <div className="bg-amber-50/50 p-4 border-b border-amber-200 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{CATEGORY_ICONS[c.category] || '🏛️'}</span>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-gray-900">{CATEGORY_MAP[c.category] || c.category}</span>
                          <span className="text-xs text-gray-500">· {c.department}</span>
                          <span className="bg-amber-200 text-amber-900 text-xs px-2 py-0.5 rounded-full font-bold">
                            {c.total_complaints} Citizen Reports Merged
                          </span>
                        </div>
                        <p className="text-xs text-brand-800 font-medium mt-0.5 flex items-center gap-1">
                          <span>📍</span> {c.location}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border whitespace-nowrap ${
                          STATUS_CONFIG[c.status]?.bg || 'bg-gray-100'
                        }`}
                      >
                        <span className={`w-2 h-2 rounded-full ${STATUS_CONFIG[c.status]?.dot || 'bg-gray-400'}`} />
                        <span>{STATUS_CONFIG[c.status]?.label || c.status?.toUpperCase()}</span>
                      </span>

                      <button
                        onClick={() => {
                          setClusterModalTarget(c)
                          setClusterNewStatus(c.status)
                          setClusterNote('')
                          setClusterPhoto(null)
                        }}
                        className="px-3.5 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-bold cursor-pointer transition shadow-xs flex items-center gap-1.5"
                      >
                        <span>📢</span>
                        <span>Resolve & Broadcast SMS to All ({c.total_complaints})</span>
                      </button>
                    </div>
                  </div>

                  {/* List of citizen reports in this cluster */}
                  <div className="p-4 space-y-3">
                    <p className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                      Citizens who reported this incident:
                    </p>
                    <div className="grid gap-2.5 sm:grid-cols-2">
                      {c.complaints?.map((cmp, cIdx) => (
                        <div
                          key={cmp.id || cIdx}
                          className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs space-y-2"
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="font-bold text-gray-900">
                                {cmp.user_phone ? `📞 ${cmp.user_phone}` : '📞 Citizen'}
                              </p>
                              {cmp.user_email && <p className="text-gray-500">{cmp.user_email}</p>}
                            </div>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                                STATUS_CONFIG[cmp.status]?.bg || 'bg-gray-100'
                              }`}
                            >
                              {cmp.status?.toUpperCase()}
                            </span>
                          </div>

                          <p className="text-gray-800 bg-white p-2 rounded border border-gray-100 italic">
                            "{cmp.text}"
                          </p>

                          <div className="flex justify-between text-[11px] text-gray-400 pt-1 border-t border-gray-100">
                            <span>Reputation: {cmp.user_reputation ?? 100}</span>
                            <span>Reported: {new Date(cmp.created_at).toLocaleString()}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: DEPARTMENT ANALYTICS & INSIGHTS */}
      {activeTab === 'analytics' && analytics && (
        <div className="grid gap-6 md:grid-cols-2">
          <div className="bg-white rounded-xl shadow p-5 border border-gray-100">
            <h3 className="text-sm font-bold text-gray-900 mb-3">Grievances by Category</h3>
            <div className="space-y-2 text-xs">
              {Object.entries(analytics.by_category || {}).map(([cat, count]) => (
                <div key={cat} className="flex items-center justify-between p-2 rounded-lg bg-gray-50">
                  <div className="flex items-center gap-2">
                    <span>{CATEGORY_ICONS[cat] || '🏛️'}</span>
                    <span className="font-medium text-gray-800">{CATEGORY_MAP[cat] || cat}</span>
                  </div>
                  <span className="font-bold text-brand-700 bg-white px-2 py-0.5 rounded border border-gray-200">
                    {count}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl shadow p-5 border border-gray-100">
            <h3 className="text-sm font-bold text-gray-900 mb-3">Resolution Metrics</h3>
            <div className="space-y-3 text-xs">
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex justify-between items-center">
                <div>
                  <p className="font-bold text-emerald-900">Solved Cases</p>
                  <p className="text-emerald-700">Successfully inspected and fixed</p>
                </div>
                <span className="text-2xl font-black text-emerald-800">{analytics.by_status?.solved || 0}</span>
              </div>

              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg flex justify-between items-center">
                <div>
                  <p className="font-bold text-blue-900">In Progress</p>
                  <p className="text-blue-700">Field work actively underway</p>
                </div>
                <span className="text-2xl font-black text-blue-800">{analytics.by_status?.in_progress || 0}</span>
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex justify-between items-center">
                <div>
                  <p className="font-bold text-amber-900">Pending Review</p>
                  <p className="text-amber-700">Awaiting department technician dispatch</p>
                </div>
                <span className="text-2xl font-black text-amber-800">{analytics.by_status?.unsolved || 0}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1: Update Single Grievance Status & Dispatch SMS */}
      {statusModalGrievance && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl">
            <div className="flex justify-between items-start mb-3">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Update Grievance Status</h3>
                <p className="text-xs text-gray-500">
                  Update resolution step, log field notes, attach photo, and dispatch SMS.
                </p>
              </div>
              <button
                onClick={() => setStatusModalGrievance(null)}
                className="text-gray-400 hover:text-gray-700 text-lg font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Citizen Contact Card */}
            <div className="bg-brand-50/70 border border-brand-200 rounded-xl p-3 mb-3 text-xs">
              <p className="font-bold text-brand-950 mb-1">👤 Citizen Filer Information:</p>
              <div className="grid grid-cols-2 gap-2 text-brand-900">
                <div>
                  <span className="text-gray-500">Phone Number:</span>{' '}
                  <strong className="text-gray-900">{statusModalGrievance.user_phone || 'Unverified'}</strong>
                </div>
                <div>
                  <span className="text-gray-500">Email:</span>{' '}
                  <span className="text-gray-900">{statusModalGrievance.user_email || '—'}</span>
                </div>
                <div>
                  <span className="text-gray-500">Reputation Score:</span>{' '}
                  <strong>{statusModalGrievance.user_reputation ?? 100}/100</strong>
                </div>
                <div>
                  <span className="text-gray-500">Grievance ID:</span> #{statusModalGrievance.id.slice(0, 6)}
                </div>
              </div>
            </div>

            {/* Full Complaint Statement */}
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 mb-4 text-xs">
              <p className="font-bold text-gray-800 mb-1 flex items-center justify-between">
                <span>📝 Full Grievance Statement:</span>
                <span className="text-[11px] font-semibold text-brand-700 bg-white px-2 py-0.5 rounded border border-gray-200">
                  {CATEGORY_MAP[statusModalGrievance.category] || statusModalGrievance.category}
                </span>
              </p>
              <p className="text-gray-900 font-medium leading-relaxed bg-white p-2.5 rounded-lg border border-gray-200">
                "{statusModalGrievance.text}"
              </p>
              {statusModalGrievance.location && (
                <p className="text-xs text-brand-800 font-semibold mt-2 flex items-center gap-1">
                  <span>📍 Location:</span>
                  <span>{statusModalGrievance.location}</span>
                </p>
              )}
              {statusModalGrievance.image_url && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-gray-500">Photo:</span>
                  <a
                    href={statusModalGrievance.image_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-brand-600 font-semibold hover:underline inline-flex items-center gap-1"
                  >
                    📸 View Attached Photo
                  </a>
                </div>
              )}
            </div>

            <form onSubmit={handleSaveStatusWithPhoto} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">New Resolution Status</label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-brand-500 focus:outline-none"
                >
                  <option value="unsolved">⏳ Unsolved (Pending Inspection)</option>
                  <option value="in_progress">⚙️ In Progress (Field Team Dispatched)</option>
                  <option value="solved">✅ Solved (Work Completed)</option>
                  <option value="rejected">❌ Rejected (Out of Scope / False)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Status Message / Field Note
                </label>
                <textarea
                  rows={3}
                  value={statusNote}
                  onChange={(e) => setStatusNote(e.target.value)}
                  placeholder="e.g. Repair crew has sealed the water main valve. Road repaving scheduled for tomorrow 10 AM."
                  className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-brand-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  📸 Attach Progress Photo (optional)
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setProgressPhoto(e.target.files?.[0] || null)}
                  className="w-full text-xs text-gray-600"
                />
              </div>

              {/* Duplicate cluster cascade toggle */}
              {statusModalGrievance.is_duplicate && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900">
                  <label className="flex items-center gap-2 font-semibold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={updateClusterCascade}
                      onChange={(e) => setUpdateClusterCascade(e.target.checked)}
                      className="rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                    />
                    <span>
                      Broadcast & update all {statusModalGrievance.similar_complaint_ids?.length || 1} other linked citizen complaints in this duplicate cluster
                    </span>
                  </label>
                </div>
              )}

              {/* Live SMS dispatch preview */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-900">
                <p className="font-semibold mb-0.5">📲 Automated SMS Dispatch Preview:</p>
                <p className="italic text-blue-800">
                  "Status updated to {newStatus.toUpperCase()}
                  {statusNote ? `: ${statusNote}` : ''}"
                </p>
                <p className="text-[11px] text-blue-600 mt-1">
                  Recipient: <strong>{statusModalGrievance.user_phone || 'Citizen'}</strong>
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setStatusModalGrievance(null)}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updatingStatus}
                  className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-semibold cursor-pointer transition shadow-xs flex items-center gap-1.5"
                >
                  {updatingStatus ? 'Dispatching SMS & Updating…' : 'Save Status & Notify Citizen'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Bulk Cluster Resolution & SMS Broadcast */}
      {clusterModalTarget && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl">
            <div className="flex justify-between items-start mb-3">
              <div>
                <h3 className="text-lg font-bold text-gray-900">
                  Resolve Duplicate Cluster ({clusterModalTarget.total_complaints} Citizens)
                </h3>
                <p className="text-xs text-gray-500">
                  Update status and broadcast SMS notifications to all filers who reported this issue.
                </p>
              </div>
              <button
                onClick={() => setClusterModalTarget(null)}
                className="text-gray-400 hover:text-gray-700 text-lg font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* List of Filers to be Notified */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-xs">
              <p className="font-bold text-amber-950 mb-1.5">
                👥 SMS Will Be Dispatched To All {clusterModalTarget.complaints?.length} Citizens:
              </p>
              <div className="space-y-1">
                {clusterModalTarget.complaints?.map((cmp, idx) => (
                  <div key={idx} className="flex justify-between items-center bg-white/70 px-2 py-1 rounded">
                    <span className="font-semibold text-gray-900">
                      📞 {cmp.user_phone || 'Citizen'}
                    </span>
                    <span className="text-gray-500">{cmp.user_email || '—'}</span>
                    <span className="text-[11px] text-gray-400">Score: {cmp.user_reputation ?? 100}</span>
                  </div>
                ))}
              </div>
            </div>

            <form onSubmit={handleClusterBulkUpdate} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">New Resolution Status</label>
                <select
                  value={clusterNewStatus}
                  onChange={(e) => setClusterNewStatus(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-brand-500 focus:outline-none"
                >
                  <option value="unsolved">⏳ Unsolved (Pending Inspection)</option>
                  <option value="in_progress">⚙️ In Progress (Field Team Dispatched)</option>
                  <option value="solved">✅ Solved (Work Completed for All Reports)</option>
                  <option value="rejected">❌ Rejected (Out of Scope / False)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Resolution Note / Field Update Message
                </label>
                <textarea
                  rows={3}
                  value={clusterNote}
                  onChange={(e) => setClusterNote(e.target.value)}
                  placeholder="e.g. Municipal road team has patched the pothole and cleared traffic barriers."
                  className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:ring-2 focus:ring-brand-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  📸 Field Progress / Completion Photo (optional)
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setClusterPhoto(e.target.files?.[0] || null)}
                  className="w-full text-xs text-gray-600"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setClusterModalTarget(null)}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updatingCluster}
                  className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-semibold cursor-pointer transition shadow-xs"
                >
                  {updatingCluster ? 'Broadcasting SMS…' : `Broadcast Update to All ${clusterModalTarget.total_complaints} Citizens`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: View Grievance Timeline Audit */}
      {selectedGrievance && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl">
            <div className="flex justify-between items-start mb-4">
              <div>
                <span
                  className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold border ${
                    STATUS_CONFIG[selectedGrievance.status]?.bg || 'bg-gray-100'
                  }`}
                >
                  {STATUS_CONFIG[selectedGrievance.status]?.label || selectedGrievance.status?.toUpperCase()}
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

            {/* Filer Information */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs mb-3 flex flex-wrap justify-between gap-2">
              <div>
                <span className="text-gray-500">Citizen Phone:</span>{' '}
                <strong className="text-gray-900">{selectedGrievance.user_phone || 'Unverified'}</strong>
              </div>
              <div>
                <span className="text-gray-500">Email:</span>{' '}
                <span className="text-gray-900">{selectedGrievance.user_email || '—'}</span>
              </div>
              <div>
                <span className="text-gray-500">Reputation:</span>{' '}
                <strong>{selectedGrievance.user_reputation ?? 100}</strong>
              </div>
            </div>

            <p className="text-sm text-gray-800 bg-gray-50 p-3 rounded-lg mb-3">{selectedGrievance.text}</p>
            {selectedGrievance.location && (
              <p className="text-xs text-gray-600 mb-3">📍 Location: {selectedGrievance.location}</p>
            )}

            {selectedGrievance.image_url && (
              <div className="mb-4">
                <p className="text-xs font-semibold text-gray-700 mb-1">Citizen's Uploaded Photo:</p>
                <img
                  src={selectedGrievance.image_url}
                  alt="Original"
                  className="h-44 object-cover rounded-lg border border-gray-200"
                />
              </div>
            )}

            {/* Updates Timeline */}
            <div className="border-t border-gray-200 pt-4 mt-4">
              <h4 className="text-sm font-semibold text-gray-900 mb-3">🛠️ Audit Updates & Field Progress:</h4>
              {selectedGrievance.updates?.length === 0 ? (
                <p className="text-xs text-gray-500 italic">No updates logged yet.</p>
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
                            <p className="text-xs font-medium text-emerald-800 mb-1">📸 Progress Photo:</p>
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

function StatCard({ label, value, icon, subtext, highlight, onClick }) {
  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-xl shadow p-4 border transition cursor-pointer ${
        highlight ? 'border-amber-400 ring-2 ring-amber-300/30' : 'border-gray-100 hover:border-brand-300'
      }`}
    >
      <div className="flex justify-between items-start">
        <p className="text-xs font-medium text-gray-500">{label}</p>
        <span className="text-lg">{icon}</span>
      </div>
      <p className="text-xl font-bold text-gray-900 mt-1">{value}</p>
      {subtext && <p className="text-[11px] text-gray-400 mt-0.5">{subtext}</p>}
    </div>
  )
}

function FilterSelect({ label, value, onChange, options }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border border-gray-300 rounded-lg px-3 py-2 text-sm min-w-[9rem] focus:ring-2 focus:ring-brand-500 focus:outline-none bg-white"
      >
        <option value="">All</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {CATEGORY_MAP[o] || o.replace('_', ' ')}
          </option>
        ))}
      </select>
    </div>
  )
}
