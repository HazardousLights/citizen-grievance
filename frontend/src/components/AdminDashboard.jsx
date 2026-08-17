import React, { useState, useEffect, useCallback } from 'react'
import { listAllGrievances, updateGrievanceStatus, reclassifyGrievance, getAnalytics } from '../services/api.js'

const CATEGORIES = ['water_supply', 'electricity', 'roads', 'sanitation', 'public_safety', 'street_lights', 'garbage_waste', 'out_of_scope']
const STATUSES = ['unsolved', 'in_progress', 'solved', 'rejected']

const STATUS_COLORS = {
  unsolved: 'bg-yellow-100 text-yellow-800',
  in_progress: 'bg-blue-100 text-blue-800',
  solved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
}

export default function AdminDashboard({ showToast }) {
  const [grievances, setGrievances] = useState([])
  const [analytics, setAnalytics] = useState(null)
  const [filters, setFilters] = useState({ category: '', status: '', min_urgency: '' })
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null) // grievance id being reclassified

  const loadData = useCallback(() => {
    setLoading(true)
    const params = {}
    if (filters.category) params.category = filters.category
    if (filters.status) params.status = filters.status
    if (filters.min_urgency) params.min_urgency = filters.min_urgency

    Promise.all([listAllGrievances(params), getAnalytics()])
      .then(([gRes, aRes]) => {
        setGrievances(gRes.data)
        setAnalytics(aRes.data)
      })
      .catch(() => showToast?.('Failed to load dashboard data', 'error'))
      .finally(() => setLoading(false))
  }, [filters, showToast])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleStatusChange = async (id, status) => {
    try {
      await updateGrievanceStatus(id, { status })
      showToast('Status updated')
      loadData()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Update failed', 'error')
    }
  }

  const handleReclassify = async (id, category) => {
    try {
      await reclassifyGrievance(id, { category })
      showToast('Grievance reclassified')
      setEditing(null)
      loadData()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Reclassify failed', 'error')
    }
  }

  return (
    <div className="space-y-6">
      {analytics && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label="Total complaints" value={analytics.total_grievances} />
          <StatCard label="Duplicate clusters" value={analytics.duplicate_clusters} />
          <StatCard
            label="Avg. resolution"
            value={analytics.avg_resolution_hours ? `${analytics.avg_resolution_hours.toFixed(1)}h` : '—'}
          />
          <StatCard label="Solved" value={analytics.by_status?.solved || 0} />
        </div>
      )}

      <div className="bg-white rounded-xl shadow p-4 flex flex-wrap gap-3 items-end">
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
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-24"
          />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-4 py-2">Complaint</th>
              <th className="px-4 py-2">Category</th>
              <th className="px-4 py-2">Dept</th>
              <th className="px-4 py-2">Urgency</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Dup?</th>
              <th className="px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-gray-500">Loading…</td></tr>
            )}
            {!loading && grievances.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-gray-500">No grievances match these filters.</td></tr>
            )}
            {grievances.map((g) => (
              <tr key={g.id} className="border-t border-gray-100 align-top">
                <td className="px-4 py-2 max-w-xs">
                  <p className="line-clamp-2">{g.text}</p>
                </td>
                <td className="px-4 py-2">
                  {editing === g.id ? (
                    <select
                      defaultValue={g.category}
                      onChange={(e) => handleReclassify(g.id, e.target.value)}
                      className="border border-gray-300 rounded px-1 py-0.5 text-xs"
                    >
                      {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  ) : (
                    <span className="text-xs">{g.category.replace('_', ' ')}</span>
                  )}
                </td>
                <td className="px-4 py-2 text-xs">{g.department || '—'}</td>
                <td className="px-4 py-2 text-xs font-medium">{g.urgency_score}/10</td>
                <td className="px-4 py-2">
                  <select
                    value={g.status}
                    onChange={(e) => handleStatusChange(g.id, e.target.value)}
                    className={`text-xs font-medium px-2 py-1 rounded-full border-0 ${STATUS_COLORS[g.status] || 'bg-gray-100'}`}
                  >
                    {STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                  </select>
                </td>
                <td className="px-4 py-2 text-xs">{g.is_duplicate ? '⚠️' : '—'}</td>
                <td className="px-4 py-2">
                  <button
                    onClick={() => setEditing(editing === g.id ? null : g.id)}
                    className="text-xs text-brand-600 hover:underline"
                  >
                    {editing === g.id ? 'Cancel' : 'Reclassify'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function StatCard({ label, value }) {
  return (
    <div className="bg-white rounded-xl shadow p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-2xl font-semibold mt-1">{value}</p>
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
        className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm min-w-[10rem]"
      >
        <option value="">All</option>
        {options.map((o) => <option key={o} value={o}>{o.replace('_', ' ')}</option>)}
      </select>
    </div>
  )
}
