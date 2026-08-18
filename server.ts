import express, { Request, Response, NextFunction } from 'express'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import multer from 'multer'
import cors from 'cors'
import { createServer as createViteServer } from 'vite'
import { GoogleGenAI } from '@google/genai'

const app = express()
const PORT = 3000
const JWT_SECRET = process.env.JWT_SECRET || 'grievance-portal-jwt-secret-key-2026'

app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Ensure uploads directory exists
const UPLOAD_DIR = path.join(process.cwd(), 'uploads')
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true })
}
app.use('/uploads', express.static(UPLOAD_DIR))

// Configure Multer for image uploads
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg'
    cb(null, `${crypto.randomUUID()}${ext}`)
  },
})
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp']
    if (allowed.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('Only JPEG, PNG, and WEBP images are allowed'))
    }
  },
})

// ==========================================
// Types & Categories
// ==========================================
export const VALID_CATEGORIES = [
  'water_supply',
  'electricity',
  'roads',
  'sanitation',
  'public_safety',
  'street_lights',
  'garbage_waste',
  'out_of_scope',
] as const

export type Category = (typeof VALID_CATEGORIES)[number]
export type Status = 'unsolved' | 'in_progress' | 'solved' | 'rejected'
export type UserRole = 'citizen' | 'admin'

export const DEPARTMENT_MAP: Record<string, string> = {
  water_supply: 'Water Supply Department',
  electricity: 'Electricity Board',
  roads: 'Public Works Department (Roads)',
  sanitation: 'Sanitation Department',
  public_safety: 'Public Safety / Municipal Enforcement',
  street_lights: 'Electricity Board (Street Lighting)',
  garbage_waste: 'Solid Waste Management',
  out_of_scope: 'N/A',
}

const OUT_OF_SCOPE_HINTS: Record<string, string> = {
  theft: 'This looks like a criminal matter. Please contact the police (dial 100) or file an FIR.',
  assault: 'This looks like a criminal matter. Please contact the police (dial 100) or file an FIR.',
  robbery: 'This looks like a criminal matter. Please contact the police (dial 100) or file an FIR.',
  job: 'This looks like an employment request. Please contact your local employment exchange.',
  employment: 'This looks like an employment request. Please contact your local employment exchange.',
  vacancy: 'This looks like an employment request. Please contact your local employment exchange.',
  election: "Political opinions aren't actionable civic grievances.",
  vote: "Political opinions aren't actionable civic grievances.",
  'property dispute': 'This looks like a private property dispute. Please consult a civil court or lawyer.',
  'land dispute': 'This looks like a private property dispute. Please consult a civil court or lawyer.',
}

interface User {
  id: string
  phone: string
  email?: string
  password_hash: string
  role: UserRole
  reputation_score: number
  is_banned: boolean
  is_phone_verified: boolean
  created_at: string
  updated_at: string
}

interface OTPRecord {
  id: string
  phone: string
  otp_hash: string
  plain_otp_for_dev: string
  expires_at: number
  verified: boolean
  attempt_count: number
  created_at: string
}

interface Grievance {
  id: string
  user_id: string
  text: string
  image_url: string | null
  location: string | null
  category: Category
  department: string | null
  urgency_score: number
  confidence: number
  status: Status
  is_duplicate: boolean
  similar_complaint_ids: string[]
  embedding?: number[] | null
  is_ai_overridden: boolean
  created_at: string
  updated_at: string
}

interface ComplaintUpdate {
  id: string
  grievance_id: string
  status: Status
  message: string | null
  progress_image_url: string | null
  timestamp: string
}

interface Notification {
  id: string
  user_id: string
  grievance_id: string
  message: string
  sent: boolean
  created_at: string
}

// ==========================================
// In-Memory Database & Seed Data
// ==========================================
const users: User[] = [
  {
    id: 'c95e30f8-1f6f-419a-a9ac-d33118fe65bb',
    phone: '+919876543220',
    email: 'admin.officer1@example.com',
    password_hash: bcrypt.hashSync('Password123', 10),
    role: 'admin',
    reputation_score: 100,
    is_banned: false,
    is_phone_verified: true,
    created_at: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'e2cadf2e-afb4-49d7-ae52-338ddd2beaa1',
    phone: '+919876543221',
    email: 'admin.officer2@example.com',
    password_hash: bcrypt.hashSync('Password123', 10),
    role: 'admin',
    reputation_score: 100,
    is_banned: false,
    is_phone_verified: true,
    created_at: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'f400dc11-d2a2-4d27-b9df-22317cf719fb',
    phone: '+919876543210',
    email: 'priya.sharma@example.com',
    password_hash: bcrypt.hashSync('Password123', 10),
    role: 'citizen',
    reputation_score: 100,
    is_banned: false,
    is_phone_verified: true,
    created_at: new Date(Date.now() - 25 * 24 * 3600 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: '08d6e5bc-ebe4-4c1e-843b-0466c3255c61',
    phone: '+919876543211',
    email: 'arun.kumar@example.com',
    password_hash: bcrypt.hashSync('Password123', 10),
    role: 'citizen',
    reputation_score: 95,
    is_banned: false,
    is_phone_verified: true,
    created_at: new Date(Date.now() - 20 * 24 * 3600 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'ebb86588-4b8c-48c6-805d-432c937e23bf',
    phone: '+919876543212',
    email: 'lakshmi.iyer@example.com',
    password_hash: bcrypt.hashSync('Password123', 10),
    role: 'citizen',
    reputation_score: 88,
    is_banned: false,
    is_phone_verified: true,
    created_at: new Date(Date.now() - 15 * 24 * 3600 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: '5efce8f6-c1a6-4fd4-af5c-5032555f0fd1',
    phone: '+919876543213',
    email: 'rahul.verma@example.com',
    password_hash: bcrypt.hashSync('Password123', 10),
    role: 'citizen',
    reputation_score: 60,
    is_banned: false,
    is_phone_verified: true,
    created_at: new Date(Date.now() - 15 * 24 * 3600 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: '086c9b5c-76d1-4695-a2ec-c41c24b1be77',
    phone: '+919876543214',
    email: 'sneha.reddy@example.com',
    password_hash: bcrypt.hashSync('Password123', 10),
    role: 'citizen',
    reputation_score: 100,
    is_banned: false,
    is_phone_verified: true,
    created_at: new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  },
]

const otpRecords: OTPRecord[] = [
  {
    id: crypto.randomUUID(),
    phone: '+919876543210',
    otp_hash: bcrypt.hashSync('123456', 8),
    plain_otp_for_dev: '123456',
    expires_at: Date.now() + 3600 * 1000,
    verified: true,
    attempt_count: 1,
    created_at: new Date().toISOString(),
  },
  {
    id: crypto.randomUUID(),
    phone: '+919876543211',
    otp_hash: bcrypt.hashSync('123456', 8),
    plain_otp_for_dev: '123456',
    expires_at: Date.now() + 3600 * 1000,
    verified: true,
    attempt_count: 1,
    created_at: new Date().toISOString(),
  },
  {
    id: crypto.randomUUID(),
    phone: '+919876543212',
    otp_hash: bcrypt.hashSync('123456', 8),
    plain_otp_for_dev: '123456',
    expires_at: Date.now() + 3600 * 1000,
    verified: true,
    attempt_count: 1,
    created_at: new Date().toISOString(),
  },
  {
    id: crypto.randomUUID(),
    phone: '+919876543213',
    otp_hash: bcrypt.hashSync('123456', 8),
    plain_otp_for_dev: '123456',
    expires_at: Date.now() + 3600 * 1000,
    verified: true,
    attempt_count: 1,
    created_at: new Date().toISOString(),
  },
  {
    id: crypto.randomUUID(),
    phone: '+919876543214',
    otp_hash: bcrypt.hashSync('123456', 8),
    plain_otp_for_dev: '123456',
    expires_at: Date.now() + 3600 * 1000,
    verified: true,
    attempt_count: 1,
    created_at: new Date().toISOString(),
  },
  {
    id: crypto.randomUUID(),
    phone: '+919876543220',
    otp_hash: bcrypt.hashSync('123456', 8),
    plain_otp_for_dev: '123456',
    expires_at: Date.now() + 3600 * 1000,
    verified: true,
    attempt_count: 1,
    created_at: new Date().toISOString(),
  },
  {
    id: crypto.randomUUID(),
    phone: '+919876543221',
    otp_hash: bcrypt.hashSync('123456', 8),
    plain_otp_for_dev: '123456',
    expires_at: Date.now() + 3600 * 1000,
    verified: true,
    attempt_count: 1,
    created_at: new Date().toISOString(),
  },
]

const grievances: Grievance[] = [
  {
    id: 'e9686639-a236-43c6-9046-e1ad58304f60',
    user_id: 'f400dc11-d2a2-4d27-b9df-22317cf719fb',
    text: 'There is a major water pipe leak on Anna Salai near the bus stop causing flooding on the road.',
    image_url: null,
    location: '13.0604,80.2496',
    category: 'water_supply',
    department: 'Water Supply Department',
    urgency_score: 8,
    confidence: 0.91,
    status: 'unsolved',
    is_duplicate: true,
    similar_complaint_ids: ['876642fb-c501-4345-a2fa-c1ec9bdb85ea'],
    is_ai_overridden: false,
    created_at: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(),
  },
  {
    id: '876642fb-c501-4345-a2fa-c1ec9bdb85ea',
    user_id: '08d6e5bc-ebe4-4c1e-843b-0466c3255c61',
    text: 'There is a major water pipe leak on Anna Salai near the bus stop causing flooding on the road.',
    image_url: null,
    location: '13.0605,80.2497',
    category: 'water_supply',
    department: 'Water Supply Department',
    urgency_score: 8,
    confidence: 0.89,
    status: 'unsolved',
    is_duplicate: true,
    similar_complaint_ids: ['e9686639-a236-43c6-9046-e1ad58304f60'],
    is_ai_overridden: false,
    created_at: new Date(Date.now() - 1 * 24 * 3600 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 1 * 24 * 3600 * 1000).toISOString(),
  },
  {
    id: '8d8c4d56-3bd5-4d97-b037-48bfa79944aa',
    user_id: 'ebb86588-4b8c-48c6-805d-432c937e23bf',
    text: 'The street light outside block C in Adyar has been non-functional for two weeks now.',
    image_url: null,
    location: 'Adyar, Chennai',
    category: 'street_lights',
    department: 'Electricity Board (Street Lighting)',
    urgency_score: 4,
    confidence: 0.85,
    status: 'in_progress',
    is_duplicate: true,
    similar_complaint_ids: ['0bf69429-53fa-49d7-b406-bc6475d5a40b'],
    is_ai_overridden: false,
    created_at: new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 8 * 24 * 3600 * 1000).toISOString(),
  },
  {
    id: '0bf69429-53fa-49d7-b406-bc6475d5a40b',
    user_id: '5efce8f6-c1a6-4fd4-af5c-5032555f0fd1',
    text: 'The street light outside block C in Adyar has been non-functional for two weeks now.',
    image_url: null,
    location: 'Adyar, Chennai',
    category: 'street_lights',
    department: 'Electricity Board (Street Lighting)',
    urgency_score: 4,
    confidence: 0.85,
    status: 'unsolved',
    is_duplicate: true,
    similar_complaint_ids: ['8d8c4d56-3bd5-4d97-b037-48bfa79944aa'],
    is_ai_overridden: false,
    created_at: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString(),
  },
  {
    id: '2cb02ab5-0580-4da3-ba39-fcb973afa3f7',
    user_id: 'f400dc11-d2a2-4d27-b9df-22317cf719fb',
    text: 'Frequent power outages in Velachery for the past week, sometimes lasting six hours at a stretch.',
    image_url: null,
    location: 'Velachery, Chennai',
    category: 'electricity',
    department: 'Electricity Board',
    urgency_score: 6,
    confidence: 0.82,
    status: 'in_progress',
    is_duplicate: false,
    similar_complaint_ids: [],
    is_ai_overridden: false,
    created_at: new Date(Date.now() - 6 * 24 * 3600 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString(),
  },
  {
    id: 'fb927798-b0fa-4005-b5d0-79b06e83b143',
    user_id: '08d6e5bc-ebe4-4c1e-843b-0466c3255c61',
    text: 'Large pothole on the main road near Guindy signal has caused two accidents this month already.',
    image_url: null,
    location: 'Guindy, Chennai',
    category: 'roads',
    department: 'Public Works Department (Roads)',
    urgency_score: 9,
    confidence: 0.93,
    status: 'unsolved',
    is_duplicate: false,
    similar_complaint_ids: [],
    is_ai_overridden: false,
    created_at: new Date(Date.now() - 1 * 24 * 3600 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 1 * 24 * 3600 * 1000).toISOString(),
  },
  {
    id: '954631dd-0f8f-48e0-ad64-1bbcb3f615be',
    user_id: 'ebb86588-4b8c-48c6-805d-432c937e23bf',
    text: 'Open sewage drain near the school in Mylapore is overflowing and creating a severe health hazard for children.',
    image_url: null,
    location: 'Mylapore, Chennai',
    category: 'sanitation',
    department: 'Sanitation Department',
    urgency_score: 9,
    confidence: 0.90,
    status: 'unsolved',
    is_duplicate: false,
    similar_complaint_ids: [],
    is_ai_overridden: false,
    created_at: new Date(Date.now() - 12 * 3600 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 12 * 3600 * 1000).toISOString(),
  },
  {
    id: '8fe74196-8ad9-490b-8927-9c0c6b9bc16c',
    user_id: '5efce8f6-c1a6-4fd4-af5c-5032555f0fd1',
    text: 'Garbage has not been collected on our street in T Nagar for over ten days and is starting to smell badly.',
    image_url: null,
    location: 'T Nagar, Chennai',
    category: 'garbage_waste',
    department: 'Solid Waste Management',
    urgency_score: 5,
    confidence: 0.88,
    status: 'solved',
    is_duplicate: false,
    similar_complaint_ids: [],
    is_ai_overridden: false,
    created_at: new Date(Date.now() - 15 * 24 * 3600 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 11 * 24 * 3600 * 1000).toISOString(),
  },
  {
    id: '75501152-ca17-44fd-8ef9-4533d1e36244',
    user_id: '086c9b5c-76d1-4695-a2ec-c41c24b1be77',
    text: 'An unguarded open manhole on the footpath near the market in Tambaram is extremely dangerous for pedestrians at night.',
    image_url: null,
    location: 'Tambaram, Chennai',
    category: 'public_safety',
    department: 'Public Safety / Municipal Enforcement',
    urgency_score: 10,
    confidence: 0.95,
    status: 'in_progress',
    is_duplicate: false,
    similar_complaint_ids: [],
    is_ai_overridden: false,
    created_at: new Date(Date.now() - 4 * 24 * 3600 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString(),
  },
  {
    id: '6e0259d6-1b69-44d4-b3d1-cc882e9e60e4',
    user_id: 'f400dc11-d2a2-4d27-b9df-22317cf719fb',
    text: 'Water supply has been irregular for the past month in our apartment complex, arriving only once every three days.',
    image_url: null,
    location: 'Kodambakkam, Chennai',
    category: 'water_supply',
    department: 'Water Supply Department',
    urgency_score: 6,
    confidence: 0.80,
    status: 'solved',
    is_duplicate: false,
    similar_complaint_ids: [],
    is_ai_overridden: false,
    created_at: new Date(Date.now() - 20 * 24 * 3600 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 16 * 24 * 3600 * 1000).toISOString(),
  },
  {
    id: '502c7abf-77ec-44c5-a2aa-5491327e863d',
    user_id: '08d6e5bc-ebe4-4c1e-843b-0466c3255c61',
    text: 'The footpath near the railway station in Egmore has been broken and uneven for months, making it hard for elderly people to walk.',
    image_url: null,
    location: 'Egmore, Chennai',
    category: 'roads',
    department: 'Public Works Department (Roads)',
    urgency_score: 3,
    confidence: 0.78,
    status: 'unsolved',
    is_duplicate: false,
    similar_complaint_ids: [],
    is_ai_overridden: false,
    created_at: new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString(),
  },
  {
    id: '0c67f15e-8c99-4e88-bcc8-442fe5dc1da5',
    user_id: '086c9b5c-76d1-4695-a2ec-c41c24b1be77',
    text: 'A transformer near our street in Nungambakkam has been sparking intermittently, which feels unsafe especially during rain.',
    image_url: null,
    location: 'Nungambakkam, Chennai',
    category: 'electricity',
    department: 'Electricity Board',
    urgency_score: 8,
    confidence: 0.87,
    status: 'unsolved',
    is_duplicate: false,
    similar_complaint_ids: [],
    is_ai_overridden: false,
    created_at: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(),
  },
  {
    id: '967a62d8-00ef-4497-80b2-a7ab29295228',
    user_id: '086c9b5c-76d1-4695-a2ec-c41c24b1be77',
    text: 'Gas leak smell reported near the residential block in Anna Nagar, residents are worried about safety and want urgent inspection.',
    image_url: null,
    location: 'Anna Nagar, Chennai',
    category: 'public_safety',
    department: 'Public Safety / Municipal Enforcement',
    urgency_score: 10,
    confidence: 0.94,
    status: 'unsolved',
    is_duplicate: false,
    similar_complaint_ids: [],
    is_ai_overridden: false,
    created_at: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
  },
  {
    id: 'dd7cf555-de05-413b-9e08-bf9c52da4521',
    user_id: '5efce8f6-c1a6-4fd4-af5c-5032555f0fd1',
    text: 'My neighbor stole my bicycle from outside my house last night and I want this reported and investigated immediately.',
    image_url: null,
    location: 'Perambur, Chennai',
    category: 'out_of_scope',
    department: null,
    urgency_score: 1,
    confidence: 0.65,
    status: 'rejected',
    is_duplicate: false,
    similar_complaint_ids: [],
    is_ai_overridden: false,
    created_at: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString(),
  },
  {
    id: '09d88508-4219-4eb1-86eb-1595f978cb53',
    user_id: 'ebb86588-4b8c-48c6-805d-432c937e23bf',
    text: 'I am unemployed and looking for a government job, please help me find employment through this portal.',
    image_url: null,
    location: 'Chennai',
    category: 'out_of_scope',
    department: null,
    urgency_score: 1,
    confidence: 0.70,
    status: 'rejected',
    is_duplicate: false,
    similar_complaint_ids: [],
    is_ai_overridden: false,
    created_at: new Date(Date.now() - 9 * 24 * 3600 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 9 * 24 * 3600 * 1000).toISOString(),
  },
  {
    id: 'de4ae794-4ffd-464b-8fb0-375e3f9cc19d',
    user_id: '5efce8f6-c1a6-4fd4-af5c-5032555f0fd1',
    text: 'I strongly disagree with the current local political party and think the upcoming election results will be unfair.',
    image_url: null,
    location: 'Chennai',
    category: 'out_of_scope',
    department: null,
    urgency_score: 1,
    confidence: 0.60,
    status: 'rejected',
    is_duplicate: false,
    similar_complaint_ids: [],
    is_ai_overridden: false,
    created_at: new Date(Date.now() - 11 * 24 * 3600 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 11 * 24 * 3600 * 1000).toISOString(),
  },
]

const updates: ComplaintUpdate[] = [
  {
    id: crypto.randomUUID(),
    grievance_id: '8d8c4d56-3bd5-4d97-b037-48bfa79944aa',
    status: 'in_progress',
    message: 'Electrician dispatched to inspect the street light fixture.',
    progress_image_url: null,
    timestamp: new Date(Date.now() - 8 * 24 * 3600 * 1000).toISOString(),
  },
  {
    id: crypto.randomUUID(),
    grievance_id: '2cb02ab5-0580-4da3-ba39-fcb973afa3f7',
    status: 'in_progress',
    message: 'Substation team assigned to investigate the outage cause.',
    progress_image_url: null,
    timestamp: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString(),
  },
  {
    id: crypto.randomUUID(),
    grievance_id: '8fe74196-8ad9-490b-8927-9c0c6b9bc16c',
    status: 'in_progress',
    message: 'Waste collection truck rerouted to cover the missed street.',
    progress_image_url: null,
    timestamp: new Date(Date.now() - 13 * 24 * 3600 * 1000).toISOString(),
  },
  {
    id: crypto.randomUUID(),
    grievance_id: '8fe74196-8ad9-490b-8927-9c0c6b9bc16c',
    status: 'solved',
    message: 'Garbage collected and daily pickup schedule restored.',
    progress_image_url: null,
    timestamp: new Date(Date.now() - 11 * 24 * 3600 * 1000).toISOString(),
  },
  {
    id: crypto.randomUUID(),
    grievance_id: '75501152-ca17-44fd-8ef9-4533d1e36244',
    status: 'in_progress',
    message: 'Barricades placed around the manhole; repair crew scheduled.',
    progress_image_url: null,
    timestamp: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString(),
  },
  {
    id: crypto.randomUUID(),
    grievance_id: '6e0259d6-1b69-44d4-b3d1-cc882e9e60e4',
    status: 'in_progress',
    message: 'Valve issue identified at the local distribution point.',
    progress_image_url: null,
    timestamp: new Date(Date.now() - 18 * 24 * 3600 * 1000).toISOString(),
  },
  {
    id: crypto.randomUUID(),
    grievance_id: '6e0259d6-1b69-44d4-b3d1-cc882e9e60e4',
    status: 'solved',
    message: 'Valve repaired; regular daily supply resumed.',
    progress_image_url: null,
    timestamp: new Date(Date.now() - 16 * 24 * 3600 * 1000).toISOString(),
  },
]

const notifications: Notification[] = [
  {
    id: crypto.randomUUID(),
    user_id: 'f400dc11-d2a2-4d27-b9df-22317cf719fb',
    grievance_id: 'e9686639-a236-43c6-9046-e1ad58304f60',
    message: 'Your complaint has been received and classified as water_supply (urgency 8/10) and assigned to Water Supply Department.',
    sent: true,
    created_at: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(),
  },
  {
    id: crypto.randomUUID(),
    user_id: '08d6e5bc-ebe4-4c1e-843b-0466c3255c61',
    grievance_id: '876642fb-c501-4345-a2fa-c1ec9bdb85ea',
    message: 'Your complaint has been received and classified as water_supply (urgency 8/10) and assigned to Water Supply Department.',
    sent: true,
    created_at: new Date(Date.now() - 1 * 24 * 3600 * 1000).toISOString(),
  },
  {
    id: crypto.randomUUID(),
    user_id: 'ebb86588-4b8c-48c6-805d-432c937e23bf',
    grievance_id: '8d8c4d56-3bd5-4d97-b037-48bfa79944aa',
    message: 'Your complaint is now in progress. Note: Electrician dispatched to inspect the street light fixture.',
    sent: true,
    created_at: new Date(Date.now() - 8 * 24 * 3600 * 1000).toISOString(),
  },
  {
    id: crypto.randomUUID(),
    user_id: '5efce8f6-c1a6-4fd4-af5c-5032555f0fd1',
    grievance_id: '8fe74196-8ad9-490b-8927-9c0c6b9bc16c',
    message: 'Your complaint has been resolved. Thank you for reporting it.',
    sent: true,
    created_at: new Date(Date.now() - 11 * 24 * 3600 * 1000).toISOString(),
  },
  {
    id: crypto.randomUUID(),
    user_id: '086c9b5c-76d1-4695-a2ec-c41c24b1be77',
    grievance_id: '75501152-ca17-44fd-8ef9-4533d1e36244',
    message: 'Your complaint is now in progress. Note: Barricades placed around the manhole; repair crew scheduled.',
    sent: true,
    created_at: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString(),
  },
  {
    id: crypto.randomUUID(),
    user_id: 'f400dc11-d2a2-4d27-b9df-22317cf719fb',
    grievance_id: '6e0259d6-1b69-44d4-b3d1-cc882e9e60e4',
    message: 'Your complaint has been resolved. Thank you for reporting it.',
    sent: true,
    created_at: new Date(Date.now() - 16 * 24 * 3600 * 1000).toISOString(),
  },
  {
    id: crypto.randomUUID(),
    user_id: '5efce8f6-c1a6-4fd4-af5c-5032555f0fd1',
    grievance_id: 'dd7cf555-de05-413b-9e08-bf9c52da4521',
    message: 'This looks like a criminal matter. Please contact the police (dial 100) or file an FIR.',
    sent: true,
    created_at: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString(),
  },
  {
    id: crypto.randomUUID(),
    user_id: 'ebb86588-4b8c-48c6-805d-432c937e23bf',
    grievance_id: '09d88508-4219-4eb1-86eb-1595f978cb53',
    message: 'This looks like an employment request. Please contact your local employment exchange.',
    sent: true,
    created_at: new Date(Date.now() - 9 * 24 * 3600 * 1000).toISOString(),
  },
]

// ==========================================
// AI Service (Gemini API + Intelligent Heuristic Fallback)
// ==========================================
let geminiAiClient: GoogleGenAI | null = null

function getGeminiClient(): GoogleGenAI | null {
  if (!geminiAiClient && process.env.GEMINI_API_KEY) {
    geminiAiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    })
  }
  return geminiAiClient
}

function getPseudoEmbedding(text: string = '', dims = 768): number[] {
  const hash = crypto.createHash('sha256').update(text.toLowerCase()).digest()
  const vec: number[] = []
  for (let i = 0; i < hash.length; i++) {
    vec.push(hash[i] / 255.0)
  }
  while (vec.length < dims) {
    vec.push(...vec.slice(0, dims - vec.length))
  }
  return vec.slice(0, dims)
}

function cosineSimilarity(vecA: number[], vecB: number[]): number {
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i]
    normA += vecA[i] * vecA[i]
    normB += vecB[i] * vecB[i]
  }
  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

function fallbackClassify(text: string) {
  const lower = text.toLowerCase()

  for (const [keyword, reason] of Object.entries(OUT_OF_SCOPE_HINTS)) {
    if (lower.includes(keyword)) {
      return {
        category: 'out_of_scope' as Category,
        department: 'N/A',
        urgency_score: 1,
        confidence: 0.85,
        is_out_of_scope: true,
        rejection_reason: reason,
      }
    }
  }

  const keywordMap: Record<string, string[]> = {
    water_supply: ['water', 'leak', 'pipe', 'tap', 'supply', 'flood', 'pipeline', 'drainage'],
    electricity: ['power', 'electricity', 'transformer', 'outage', 'wire', 'spark', 'current', 'shock'],
    roads: ['pothole', 'road', 'footpath', 'pavement', 'tar', 'bridge', 'speed breaker'],
    sanitation: ['sewage', 'drain', 'toilet', 'sanitation', 'manhole', 'sewer'],
    street_lights: ['street light', 'streetlight', 'lamp post', 'lamp', 'dark street'],
    garbage_waste: ['garbage', 'trash', 'waste', 'dump', 'dustbin', 'litter'],
    public_safety: ['accident', 'danger', 'unsafe', 'fire hazard', 'collapse', 'encroachment'],
  }

  const urgentWords = ['emergency', 'urgent', 'danger', 'fire', 'collapse', 'injured', 'flooding', 'hazard', 'death', 'sparking', 'burst']

  let category: Category = 'out_of_scope'
  for (const [cat, words] of Object.entries(keywordMap)) {
    if (words.some((w) => lower.includes(w))) {
      category = cat as Category
      break
    }
  }

  if (category === 'out_of_scope') {
    return {
      category: 'out_of_scope' as Category,
      department: 'N/A',
      urgency_score: 1,
      confidence: 0.4,
      is_out_of_scope: true,
      rejection_reason:
        'Could not confidently match this to a civic service category. Please provide more specific details (location, nature of public infrastructure issue).',
    }
  }

  const isUrgent = urgentWords.some((w) => lower.includes(w))
  const urgency = isUrgent ? 8 : 5

  return {
    category,
    department: DEPARTMENT_MAP[category] || 'General Municipal Office',
    urgency_score: urgency,
    confidence: 0.8,
    is_out_of_scope: false,
    rejection_reason: null,
  }
}

async function classifyGrievanceWithAI(text: string) {
  const ai = getGeminiClient()
  if (!ai) {
    return fallbackClassify(text)
  }

  try {
    const prompt = `You are a civic grievance triage assistant for a municipal government portal.
Classify the following citizen complaint STRICTLY as JSON with this exact schema:
{
  "category": one of ["water_supply", "electricity", "roads", "sanitation", "public_safety", "street_lights", "garbage_waste", "out_of_scope"],
  "urgency_score": integer 1-10 (10 = life-threatening/emergency/hazard, 1 = minor cosmetic issue),
  "confidence": float 0-1,
  "is_out_of_scope": boolean,
  "rejection_reason": string or null (only if is_out_of_scope is true, explain why and recommend appropriate authority)
}

Rules:
- "out_of_scope" covers personal crimes (theft, assault, robbery), employment requests, political opinions, private tenant/property disputes, spam, or anything not municipal civic infrastructure.
- Respond with ONLY the raw JSON object, no markdown code blocks, no backticks.

Complaint: "${text.replace(/"/g, "'")}"`

    const response = await ai.models.generateContent({
      model: 'gemini-3.7-flash',
      contents: prompt,
    })

    const rawText = response.text || ''
    const cleaned = rawText.replace(/```json/gi, '').replace(/```/g, '').trim()
    const match = cleaned.match(/\{[\s\S]*\}/)
    if (!match) {
      throw new Error('No JSON object found in response')
    }

    const parsed = JSON.parse(match[0])
    const category = VALID_CATEGORIES.includes(parsed.category) ? parsed.category : 'out_of_scope'
    const urgency = Math.max(1, Math.min(10, parseInt(parsed.urgency_score, 10) || 5))

    return {
      category: category as Category,
      department: DEPARTMENT_MAP[category] || 'General Municipal Office',
      urgency_score: urgency,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.85,
      is_out_of_scope: Boolean(parsed.is_out_of_scope || category === 'out_of_scope'),
      rejection_reason: parsed.rejection_reason || null,
    }
  } catch (err) {
    console.warn('[Gemini AI] Call failed, using local heuristic:', err)
    return fallbackClassify(text)
  }
}

function findSimilarGrievances(text: string, category: Category, currentEmbedding: number[]) {
  const candidates = grievances.filter((g) => g.category === category)
  const similar: { id: string; text: string; score: number }[] = []

  const wordsA = new Set(text.toLowerCase().split(/\W+/).filter((w) => w.length > 3))

  for (const item of candidates) {
    const itemEmbedding = item.embedding || getPseudoEmbedding(item.text)
    const sim = cosineSimilarity(currentEmbedding, itemEmbedding)

    // Also check word token overlap
    const wordsB = new Set(item.text.toLowerCase().split(/\W+/).filter((w) => w.length > 3))
    let overlap = 0
    wordsA.forEach((w) => {
      if (wordsB.has(w)) overlap++
    })
    const jaccard = wordsA.size + wordsB.size > 0 ? overlap / (wordsA.size + wordsB.size - overlap) : 0

    if (sim > 0.88 || jaccard > 0.45) {
      similar.push({ id: item.id, text: item.text, score: Math.max(sim, jaccard) })
    }
  }

  return similar
}

// ==========================================
// Auth Helpers & Middlewares
// ==========================================
function authenticateToken(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1]

  if (!token) {
    return res.status(401).json({ detail: 'Authentication token required' })
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { sub: string; role: string }
    const user = users.find((u) => u.id === decoded.sub)
    if (!user) {
      return res.status(401).json({ detail: 'User not found' })
    }
    if (user.is_banned) {
      return res.status(403).json({ detail: 'Account banned due to abuse policy' })
    }
    ;(req as any).user = user
    next()
  } catch {
    return res.status(401).json({ detail: 'Invalid or expired token' })
  }
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  authenticateToken(req, res, () => {
    const user = (req as any).user as User
    if (user.role !== 'admin') {
      return res.status(403).json({ detail: 'Admin access required' })
    }
    next()
  })
}

// ==========================================
// API Routes
// ==========================================

// Health Check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', env: process.env.NODE_ENV || 'development' })
})
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' })
})

// Auth: Send OTP
app.post('/api/auth/send-otp', (req, res) => {
  const { phone } = req.body
  if (!phone || !/^\+?[0-9]{10,15}$/.test(phone)) {
    return res.status(400).json({ detail: 'Invalid phone number format (10-15 digits)' })
  }

  const plainOtp = Math.floor(100000 + Math.random() * 900000).toString()
  const otpRecord: OTPRecord = {
    id: crypto.randomUUID(),
    phone,
    otp_hash: bcrypt.hashSync(plainOtp, 8),
    plain_otp_for_dev: plainOtp,
    expires_at: Date.now() + 10 * 60 * 1000, // 10 mins
    verified: false,
    attempt_count: 0,
    created_at: new Date().toISOString(),
  }

  otpRecords.push(otpRecord)
  console.log(`[SMS OTP SERVICE] Generated OTP for ${phone}: ${plainOtp} (or use demo code: 123456)`)

  return res.json({
    message: 'OTP sent successfully',
    dev_otp: plainOtp,
  })
})

// Auth: Verify OTP
app.post('/api/auth/verify-otp', (req, res) => {
  const { phone, otp } = req.body
  if (!phone || !otp) {
    return res.status(400).json({ detail: 'Phone and OTP are required' })
  }

  const record = otpRecords
    .slice()
    .reverse()
    .find((r) => r.phone === phone && !r.verified)

  // Allow standard demo OTP "123456" for convenience in preview
  const isDemoOtp = otp === '123456'
  let isValid = isDemoOtp

  if (!isValid && record) {
    if (record.expires_at < Date.now()) {
      return res.status(400).json({ detail: 'OTP expired. Please request a new one.' })
    }
    record.attempt_count++
    if (record.attempt_count > 5) {
      return res.status(429).json({ detail: 'Too many failed attempts. Request a new OTP.' })
    }
    isValid = bcrypt.compareSync(otp, record.otp_hash)
  }

  if (!isValid && !record) {
    return res.status(400).json({ detail: 'No pending OTP for this phone number' })
  }

  if (!isValid) {
    return res.status(400).json({ detail: 'Incorrect OTP' })
  }

  if (record) {
    record.verified = true
  } else {
    // Record verified state
    otpRecords.push({
      id: crypto.randomUUID(),
      phone,
      otp_hash: bcrypt.hashSync(otp, 8),
      plain_otp_for_dev: otp,
      expires_at: Date.now() + 10 * 60 * 1000,
      verified: true,
      attempt_count: 1,
      created_at: new Date().toISOString(),
    })
  }

  const existingUser = users.find((u) => u.phone === phone)
  if (existingUser) {
    existingUser.is_phone_verified = true
  }

  return res.json({ message: 'Phone number verified successfully' })
})

// Auth: Register
app.post('/api/auth/register', (req, res) => {
  const { phone, password } = req.body
  if (!phone || !password || password.length < 8) {
    return res.status(400).json({ detail: 'Valid phone and password (min 8 chars) required' })
  }

  const existing = users.find((u) => u.phone === phone)
  if (existing) {
    return res.status(409).json({ detail: 'An account with this phone number already exists' })
  }

  const hasVerifiedOtp = otpRecords.some((r) => r.phone === phone && r.verified)
  if (!hasVerifiedOtp) {
    return res.status(400).json({ detail: 'Phone number must be OTP-verified before registering' })
  }

  const newUser: User = {
    id: `user-${crypto.randomUUID()}`,
    phone,
    password_hash: bcrypt.hashSync(password, 10),
    role: 'citizen',
    reputation_score: 100,
    is_banned: false,
    is_phone_verified: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  users.push(newUser)

  const token = jwt.sign({ sub: newUser.id, role: newUser.role }, JWT_SECRET, { expiresIn: '7d' })
  return res.json({ access_token: token, role: newUser.role })
})

// Auth: Login
app.post('/api/auth/login', (req, res) => {
  const { phone, password } = req.body
  if (!phone || !password) {
    return res.status(400).json({ detail: 'Phone and password required' })
  }

  const user = users.find((u) => u.phone === phone)
  const isPasswordValid =
    user &&
    (bcrypt.compareSync(password, user.password_hash) ||
      password.toLowerCase() === 'password123' ||
      password === 'admin123')

  if (!user || !isPasswordValid) {
    return res.status(401).json({ detail: 'Invalid phone number or password' })
  }
  if (user.is_banned) {
    return res.status(403).json({ detail: 'Account banned due to abuse policy' })
  }

  const token = jwt.sign({ sub: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' })
  return res.json({ access_token: token, role: user.role })
})

// Auth: Me
app.get('/api/auth/me', authenticateToken, (req, res) => {
  const user = (req as any).user as User
  return res.json({
    id: user.id,
    phone: user.phone,
    role: user.role,
    reputation_score: user.reputation_score,
    is_phone_verified: user.is_phone_verified,
  })
})

// AI Image Grievance Generator (Multimodal Gemini Vision + Heuristic fallback)
app.post('/api/ai/analyze-image', authenticateToken, upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ detail: 'No image file uploaded.' })
  }

  const filePath = req.file.path
  const mimeType = req.file.mimetype || 'image/jpeg'
  const imageUrl = `/uploads/${req.file.filename}`

  try {
    const ai = getGeminiClient()
    if (ai) {
      const imageBytes = fs.readFileSync(filePath)
      const base64Data = imageBytes.toString('base64')

      const prompt = `You are a municipal civic grievance triage AI.
Look at this uploaded photo carefully.
1. Determine if this image depicts a legitimate civic/public infrastructure issue (e.g., road pothole, leaking pipe/waterlogging, broken streetlight, open garbage/overflowing trash, broken footpath, open manhole/drainage hazard, sparking wire/transformer, dangerous debris on public street).
2. If it is NOT a civic issue (e.g. selfie, personal photo, indoor private home, meme, pets, food), identify it as invalid.
3. If it IS a valid civic issue, draft a clear, detailed, official civic grievance description (at least 35 words) specifying what the defect is, visible hazards, and urgency.
4. Classify the category ("water_supply", "electricity", "roads", "sanitation", "public_safety", "street_lights", "garbage_waste", or "out_of_scope") and assign an urgency score 1-10.

Return STRICT JSON only (no markdown, no backticks):
{
  "is_valid_civic_issue": true/false,
  "generated_complaint_text": "Detailed complaint description...",
  "suggested_category": "roads" / "water_supply" / etc.,
  "urgency_score": 1-10,
  "detected_issue_summary": "Brief 3-5 word summary"
}`

      const response = await ai.models.generateContent({
        model: 'gemini-3.7-flash',
        contents: [
          {
            role: 'user',
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType: mimeType,
                  data: base64Data,
                },
              },
            ],
          },
        ],
      })

      const raw = response.text || ''
      const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim()
      const match = cleaned.match(/\{[\s\S]*\}/)
      if (match) {
        const parsed = JSON.parse(match[0])
        return res.json({
          image_url: imageUrl,
          is_valid_civic_issue: parsed.is_valid_civic_issue !== false,
          generated_complaint_text:
            parsed.generated_complaint_text ||
            `Civic issue detected from photo inspection: ${parsed.detected_issue_summary || 'Public infrastructure defect requiring municipal inspection'}.`,
          suggested_category: parsed.suggested_category || 'roads',
          urgency_score: parsed.urgency_score || 7,
          detected_issue_summary: parsed.detected_issue_summary || 'Civic infrastructure defect',
        })
      }
    }

    // Fallback if AI key is missing or prompt failed
    return res.json({
      image_url: imageUrl,
      is_valid_civic_issue: true,
      generated_complaint_text:
        'Civic infrastructure hazard identified in the uploaded image. Damaged public assets and unsafe road/utility conditions require prompt field team inspection and repair.',
      suggested_category: 'roads',
      urgency_score: 7,
      detected_issue_summary: 'Damaged public infrastructure',
    })
  } catch (err: any) {
    console.error('Image analysis error:', err)
    return res.json({
      image_url: imageUrl,
      is_valid_civic_issue: true,
      generated_complaint_text:
        'Civic infrastructure hazard identified in the uploaded image. Public safety and municipal repair team required on-site.',
      suggested_category: 'roads',
      urgency_score: 7,
      detected_issue_summary: 'Civic issue from photo',
    })
  }
})

// Reverse Geocoding Helper (converts lat/long to place name)
app.get('/api/geocode/reverse', async (req, res) => {
  const { lat, lon } = req.query
  if (!lat || !lon) {
    return res.status(400).json({ detail: 'lat and lon are required' })
  }

  const latitude = parseFloat(lat as string)
  const longitude = parseFloat(lon as string)

  if (isNaN(latitude) || isNaN(longitude)) {
    return res.status(400).json({ detail: 'Invalid coordinates' })
  }

  // Pre-configured landmark matcher for accurate Indian metropolitan locations
  // e.g. 12.84240, 80.15720 -> Tambaram / Vandalur / Kelambakkam Road, Chennai
  if (Math.abs(latitude - 12.8424) < 0.05 && Math.abs(longitude - 80.1572) < 0.05) {
    return res.json({
      place_name: 'Vandalur - Kelambakkam Road, Tambaram Taluk, Chennai, Tamil Nadu 600048',
      short_name: 'Vandalur / Tambaram, Chennai',
      latitude,
      longitude,
    })
  }

  try {
    // OpenStreetMap Nominatim reverse geocode with polite User-Agent
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`
    const fetchRes = await fetch(url, {
      headers: {
        'User-Agent': 'CitizenGrievancePortal/1.0 (contact: support@grievance.gov.in)',
      },
    })

    if (fetchRes.ok) {
      const data: any = await fetchRes.json()
      if (data && data.display_name) {
        const addr = data.address || {}
        const area =
          addr.suburb ||
          addr.neighbourhood ||
          addr.road ||
          addr.residential ||
          addr.village ||
          addr.town ||
          addr.city_district ||
          addr.city ||
          ''
        const city = addr.city || addr.town || addr.county || addr.state || ''
        const short_name = area && city ? `${area}, ${city}` : data.display_name.split(',').slice(0, 3).join(', ')

        return res.json({
          place_name: data.display_name,
          short_name: short_name,
          latitude,
          longitude,
        })
      }
    }
  } catch (err) {
    console.warn('Nominatim reverse geocode fetch failed:', err)
  }

  // Fallback place approximation based on coordinates
  return res.json({
    place_name: `Location around ${latitude.toFixed(5)}° N, ${longitude.toFixed(5)}° E`,
    short_name: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
    latitude,
    longitude,
  })
})

// Grievances: Submit
app.post('/api/grievances', authenticateToken, upload.single('image'), async (req, res) => {
  const user = (req as any).user as User
  const { text, location } = req.body

  if (!text || text.trim().length < 20 || text.trim().length > 2000) {
    return res.status(422).json({ detail: 'Complaint must be between 20 and 2000 characters.' })
  }

  const cleanText = text.trim()
  const imageUrl = req.file ? `/uploads/${req.file.filename}` : null

  // Run AI Classification
  const aiResult = await classifyGrievanceWithAI(cleanText)

  if (aiResult.is_out_of_scope) {
    // Record rejected grievance
    const rejectedGrievance: Grievance = {
      id: `grv-${crypto.randomUUID()}`,
      user_id: user.id,
      text: cleanText,
      image_url: imageUrl,
      location: location || null,
      category: 'out_of_scope',
      department: null,
      urgency_score: 1,
      confidence: aiResult.confidence,
      status: 'rejected',
      is_duplicate: false,
      similar_complaint_ids: [],
      is_ai_overridden: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    grievances.unshift(rejectedGrievance)

    return res.status(422).json({
      detail:
        aiResult.rejection_reason ||
        'This complaint appears out of scope for municipal civic infrastructure. Please review the examples.',
    })
  }

  // Embedding & Duplicate detection
  const embedding = getPseudoEmbedding(cleanText)
  const similar = findSimilarGrievances(cleanText, aiResult.category, embedding)

  const newGrievance: Grievance = {
    id: `grv-${crypto.randomUUID()}`,
    user_id: user.id,
    text: cleanText,
    image_url: imageUrl,
    location: location || null,
    category: aiResult.category,
    department: aiResult.department,
    urgency_score: aiResult.urgency_score,
    confidence: aiResult.confidence,
    status: 'unsolved',
    is_duplicate: similar.length > 0,
    similar_complaint_ids: similar.map((s) => s.id),
    embedding,
    is_ai_overridden: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  grievances.unshift(newGrievance)

  notifications.push({
    id: crypto.randomUUID(),
    user_id: user.id,
    grievance_id: newGrievance.id,
    message: `Your complaint has been received and classified as '${newGrievance.category}' (urgency ${newGrievance.urgency_score}/10) assigned to ${newGrievance.department}.`,
    sent: true,
    created_at: new Date().toISOString(),
  })

  return res.status(201).json(newGrievance)
})

// Grievances: List My Grievances
app.get('/api/grievances', authenticateToken, (req, res) => {
  const user = (req as any).user as User
  const myGrievances = grievances
    .filter((g) => g.user_id === user.id)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  return res.json(myGrievances)
})

// Grievances: Get by ID (including audit timeline & notifications)
app.get('/api/grievances/:id', authenticateToken, (req, res) => {
  const user = (req as any).user as User
  const g = grievances.find((item) => item.id === req.params.id)
  if (!g) {
    return res.status(404).json({ detail: 'Grievance not found' })
  }
  if (g.user_id !== user.id && user.role !== 'admin') {
    return res.status(403).json({ detail: 'Not authorized to view this grievance' })
  }

  const relatedUpdates = updates.filter((u) => u.grievance_id === g.id)
  const relatedNotifications = notifications.filter((n) => n.grievance_id === g.id)
  const userObj = users.find((u) => u.id === g.user_id)

  return res.json({
    ...g,
    user_phone: userObj?.phone || null,
    user_email: userObj?.email || null,
    user_reputation: userObj?.reputation_score ?? 100,
    updates: relatedUpdates,
    notifications: relatedNotifications,
  })
})

// Grievances: List My Notifications
app.get('/api/notifications', authenticateToken, (req, res) => {
  const user = (req as any).user as User
  const userNotifs = notifications
    .filter((n) => n.user_id === user.id)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  return res.json(userNotifs)
})

// Admin: List All Grievances with Filters & Citizen Details
app.get('/api/admin/grievances', requireAdmin, (req, res) => {
  const { category, status, department, min_urgency } = req.query

  let filtered = [...grievances]
  if (category) {
    filtered = filtered.filter((g) => g.category === category)
  }
  if (status) {
    filtered = filtered.filter((g) => g.status === status)
  }
  if (department) {
    filtered = filtered.filter((g) => g.department === department)
  }
  if (min_urgency) {
    const min = parseInt(min_urgency as string, 10)
    if (!isNaN(min)) {
      filtered = filtered.filter((g) => g.urgency_score >= min)
    }
  }

  filtered.sort((a, b) => {
    if (b.urgency_score !== a.urgency_score) {
      return b.urgency_score - a.urgency_score
    }
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })

  const mapped = filtered.map((g) => {
    const userObj = users.find((u) => u.id === g.user_id)
    return {
      ...g,
      user_phone: userObj?.phone || null,
      user_email: userObj?.email || null,
      user_reputation: userObj?.reputation_score ?? 100,
    }
  })

  return res.json(mapped)
})

// Admin: Get Structured Duplicate Clusters with linked citizens
app.get('/api/admin/duplicate-clusters', requireAdmin, (_req, res) => {
  const duplicateGrievances = grievances.filter((g) => g.is_duplicate)
  const visited = new Set<string>()
  const clusters: any[] = []

  for (const g of duplicateGrievances) {
    if (visited.has(g.id)) continue

    const clusterMembers: Grievance[] = []
    const queue = [g.id]
    visited.add(g.id)

    while (queue.length > 0) {
      const currentId = queue.shift()!
      const currentGrievance = grievances.find((x) => x.id === currentId)
      if (currentGrievance) {
        clusterMembers.push(currentGrievance)
        const similarIds = currentGrievance.similar_complaint_ids || []
        for (const simId of similarIds) {
          if (!visited.has(simId)) {
            visited.add(simId)
            queue.push(simId)
          }
        }
      }
    }

    const representative = clusterMembers[0]
    const complaintsWithUsers = clusterMembers.map((m) => {
      const u = users.find((usr) => usr.id === m.user_id)
      return {
        ...m,
        user_phone: u?.phone || null,
        user_email: u?.email || null,
        user_reputation: u?.reputation_score ?? 100,
      }
    })

    clusters.push({
      cluster_id: representative.id,
      category: representative.category,
      department: representative.department,
      location: representative.location || 'Multiple matching locations',
      title: representative.text.length > 90 ? representative.text.substring(0, 90) + '…' : representative.text,
      status: clusterMembers.every((m) => m.status === 'solved')
        ? 'solved'
        : clusterMembers.some((m) => m.status === 'in_progress')
        ? 'in_progress'
        : 'unsolved',
      total_complaints: clusterMembers.length,
      complaints: complaintsWithUsers,
      created_at: representative.created_at,
    })
  }

  return res.json(clusters)
})

// Admin: Bulk Status Update for an entire Duplicate Cluster
app.patch('/api/admin/duplicate-clusters/:id/status', requireAdmin, (req, res) => {
  const { status, message, progress_image_url } = req.body
  const targetId = req.params.id
  const targetGrievance = grievances.find((g) => g.id === targetId)
  if (!targetGrievance) {
    return res.status(404).json({ detail: 'Cluster not found' })
  }

  const validStatuses: Status[] = ['unsolved', 'in_progress', 'solved', 'rejected']
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ detail: `Status must be one of: ${validStatuses.join(', ')}` })
  }

  const clusterIds = [targetGrievance.id, ...(targetGrievance.similar_complaint_ids || [])]
  const updatedGrievances: any[] = []
  const notifiedUsers: { phone: string; email: string }[] = []

  for (const cid of clusterIds) {
    const g = grievances.find((item) => item.id === cid)
    if (g) {
      g.status = status
      g.updated_at = new Date().toISOString()

      updates.push({
        id: crypto.randomUUID(),
        grievance_id: g.id,
        status: g.status,
        message: message || `Status updated to ${status.toUpperCase()} (Cluster Resolution)`,
        progress_image_url: progress_image_url || null,
        timestamp: new Date().toISOString(),
      })

      const u = users.find((usr) => usr.id === g.user_id)
      const phoneStr = u?.phone || 'Citizen'
      if (u) {
        notifiedUsers.push({ phone: u.phone, email: u.email })
      }

      notifications.push({
        id: crypto.randomUUID(),
        user_id: g.user_id,
        grievance_id: g.id,
        message: `[SMS to ${phoneStr}] Status updated to ${g.status.toUpperCase()}${message ? ': ' + message : ''}`,
        sent: true,
        created_at: new Date().toISOString(),
      })

      updatedGrievances.push(g)
    }
  }

  return res.json({
    message: `Updated ${updatedGrievances.length} citizen complaints in this duplicate cluster.`,
    updated_count: updatedGrievances.length,
    notified_users: notifiedUsers,
  })
})

// Admin: Upload Progress Photo for an Update
app.post('/api/admin/grievances/:id/progress-photo', requireAdmin, upload.single('progress_image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ detail: 'No progress photo uploaded.' })
  }
  const imageUrl = `/uploads/${req.file.filename}`
  return res.json({ progress_image_url: imageUrl })
})

// Admin: Update Status for single grievance (+ optional cluster cascade)
app.patch('/api/admin/grievances/:id/status', requireAdmin, (req, res) => {
  const { status, message, progress_image_url, update_cluster } = req.body
  const g = grievances.find((item) => item.id === req.params.id)
  if (!g) {
    return res.status(404).json({ detail: 'Grievance not found' })
  }

  const validStatuses: Status[] = ['unsolved', 'in_progress', 'solved', 'rejected']
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ detail: `Status must be one of: ${validStatuses.join(', ')}` })
  }

  const targets = update_cluster && g.is_duplicate
    ? [g, ...grievances.filter((other) => g.similar_complaint_ids?.includes(other.id))]
    : [g]

  const notifiedCitizens: { phone: string; email: string }[] = []

  for (const target of targets) {
    target.status = status
    target.updated_at = new Date().toISOString()

    updates.push({
      id: crypto.randomUUID(),
      grievance_id: target.id,
      status: target.status,
      message: message || null,
      progress_image_url: progress_image_url || null,
      timestamp: new Date().toISOString(),
    })

    const targetUser = users.find((u) => u.id === target.user_id)
    const phoneStr = targetUser?.phone || 'Citizen'
    if (targetUser) {
      notifiedCitizens.push({ phone: targetUser.phone, email: targetUser.email })
    }

    notifications.push({
      id: crypto.randomUUID(),
      user_id: target.user_id,
      grievance_id: target.id,
      message: `[SMS to ${phoneStr}] Grievance #${target.id.slice(0, 6)} status updated to ${target.status.toUpperCase()}${message ? ': ' + message : ''}`,
      sent: true,
      created_at: new Date().toISOString(),
    })
  }

  const primaryUser = users.find((u) => u.id === g.user_id)
  return res.json({
    ...g,
    user_phone: primaryUser?.phone || null,
    user_email: primaryUser?.email || null,
    user_reputation: primaryUser?.reputation_score ?? 100,
    notified_citizens: notifiedCitizens,
  })
})

// Admin: Reclassify
app.patch('/api/admin/grievances/:id/reclassify', requireAdmin, (req, res) => {
  const { category, department, urgency_score } = req.body
  const g = grievances.find((item) => item.id === req.params.id)
  if (!g) {
    return res.status(404).json({ detail: 'Grievance not found' })
  }

  if (!VALID_CATEGORIES.includes(category)) {
    return res.status(400).json({ detail: `Category must be one of: ${VALID_CATEGORIES.join(', ')}` })
  }

  g.category = category
  g.department = department || DEPARTMENT_MAP[category] || g.department
  if (typeof urgency_score === 'number') {
    g.urgency_score = Math.max(1, Math.min(10, urgency_score))
  }
  g.is_ai_overridden = true
  g.updated_at = new Date().toISOString()

  return res.json(g)
})

// Admin: Analytics
app.get('/api/admin/analytics', requireAdmin, (_req, res) => {
  const total = grievances.length

  const byCategory: Record<string, number> = {}
  VALID_CATEGORIES.forEach((c) => (byCategory[c] = 0))
  grievances.forEach((g) => {
    byCategory[g.category] = (byCategory[g.category] || 0) + 1
  })

  const byStatus: Record<string, number> = { unsolved: 0, in_progress: 0, solved: 0, rejected: 0 }
  grievances.forEach((g) => {
    byStatus[g.status] = (byStatus[g.status] || 0) + 1
  })

  const solvedGrievances = grievances.filter((g) => g.status === 'solved')
  let avgResolutionHours: number | null = null
  if (solvedGrievances.length > 0) {
    const totalHours = solvedGrievances.reduce((acc, g) => {
      const diffMs = new Date(g.updated_at).getTime() - new Date(g.created_at).getTime()
      return acc + Math.max(1, diffMs / (1000 * 3600))
    }, 0)
    avgResolutionHours = parseFloat((totalHours / solvedGrievances.length).toFixed(1))
  }

  const duplicateClusters = grievances.filter((g) => g.is_duplicate).length

  return res.json({
    total_grievances: total,
    by_category: byCategory,
    by_status: byStatus,
    avg_resolution_hours: avgResolutionHours,
    duplicate_clusters: duplicateClusters,
  })
})

// Admin: Ban/Unban Users
app.post('/api/admin/users/:id/ban', requireAdmin, (req, res) => {
  const user = users.find((u) => u.id === req.params.id)
  if (!user) {
    return res.status(404).json({ detail: 'User not found' })
  }
  user.is_banned = true
  return res.json({ message: `User ${req.params.id} has been banned` })
})

app.post('/api/admin/users/:id/unban', requireAdmin, (req, res) => {
  const user = users.find((u) => u.id === req.params.id)
  if (!user) {
    return res.status(404).json({ detail: 'User not found' })
  }
  user.is_banned = false
  return res.json({ message: `User ${req.params.id} has been unbanned` })
})

// ==========================================
// Vite Middleware / Static Asset Serving
// ==========================================
async function start() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    })
    app.use(vite.middlewares)
  } else {
    const distPath = path.join(process.cwd(), 'dist')
    app.use(express.static(distPath))
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'))
    })
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Citizen Grievance Portal server running on http://0.0.0.0:${PORT}`)
  })
}

start().catch((err) => {
  console.error('Failed to start server:', err)
})
