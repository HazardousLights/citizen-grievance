// services/api.js
// Centralized axios instance + API calls. Attaches JWT automatically and
// redirects to login on 401 so components don't need to repeat that logic.
import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('role')
    }
    return Promise.reject(err)
  }
)

// ---- Auth ----
export const sendOtp = (phone) => api.post('/auth/send-otp', { phone })
export const verifyOtp = (phone, otp) => api.post('/auth/verify-otp', { phone, otp })
export const register = (phone, password) => api.post('/auth/register', { phone, password })
export const login = (phone, password) => api.post('/auth/login', { phone, password })
export const getMe = () => api.get('/auth/me')

// ---- Grievances (citizen) ----
export const submitGrievance = (formData) =>
  api.post('/grievances', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
export const listMyGrievances = () => api.get('/grievances')
export const getGrievance = (id) => api.get(`/grievances/${id}`)

// ---- Admin ----
export const listAllGrievances = (params) => api.get('/admin/grievances', { params })
export const updateGrievanceStatus = (id, payload) => api.patch(`/admin/grievances/${id}/status`, payload)
export const reclassifyGrievance = (id, payload) => api.patch(`/admin/grievances/${id}/reclassify`, payload)
export const getAnalytics = () => api.get('/admin/analytics')

export default api
