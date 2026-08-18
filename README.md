# AI-Powered Citizen Grievance Portal

A full-stack, AI-powered civic grievance triage and citizen feedback portal built with **React (Vite + Tailwind CSS)** and a unified **Node.js / Express backend with Google Gemini 3.7 Flash AI**.

Citizens can submit complaints with descriptions, photos, and auto-detected GPS locations. Google Gemini automatically classifies the issue, predicts urgency, checks for duplicates, and routes it to municipal departments. Administrators manage incoming grievances, inspect multi-citizen duplicate clusters, upload proof of work photos, and broadcast status SMS updates.

---

## 🏗️ Architecture & Real Tech Stack

- **Unified Full-Stack Runtime**: Node.js 18+ with TypeScript & `tsx`
- **Frontend**: React 18, Vite 5, Tailwind CSS, Lucide Icons, Framer Motion
- **Backend**: Express 4 server integrated with Vite middleware in `server.ts`
- **AI Engine**: Google Gemini API (`@google/genai` using `gemini-3.7-flash`) for text classification, priority scoring, multimodal photo analysis, and duplicate detection
- **Authentication**: JWT authentication with SMS / Phone OTP verification & role-based access control (`citizen` / `admin`)
- **Database & Storage (Seed/Production)**: PostgreSQL / Supabase ready (`seed_grievance_db.sql` included) + built-in fallback state engine for immediate local zero-config runs

---

## 📁 Actual Repository File Structure

```text
citizen-grievance-portal/
├── server.ts                  # Express server + Vite SPA middleware + Gemini AI + all API endpoints
├── index.html                 # HTML entry point
├── package.json               # Full-stack dependencies & scripts (React, Express, @google/genai, tsx, esbuild)
├── tsconfig.json              # TypeScript compiler configuration
├── vite.config.ts             # Vite build & plugin setup
├── tailwind.config.js         # Tailwind CSS theme and styling configuration
├── postcss.config.js          # PostCSS configuration
├── metadata.json              # Application metadata & capabilities
├── seed_grievance_db.sql      # Complete PostgreSQL/Supabase database schema & seed records
├── .env.example               # Environment variables template
├── uploads/                   # Local storage directory for grievance & resolution photos
└── src/
    ├── main.jsx               # React client bootstrap
    ├── App.jsx                # Core app layout, navigation, auth session & notifications
    ├── index.css              # Global styles & Tailwind imports
    ├── components/
    │   ├── AdminDashboard.jsx     # Admin panel (Grievance table, duplicate clusters, status update & SMS)
    │   ├── GrievanceForm.jsx      # Citizen filing form (AI camera photo analysis, GPS geocoding, grievance list)
    │   ├── LoginForm.jsx          # Dual login: Password & Phone OTP verification
    │   ├── RegisterForm.jsx       # Citizen registration form
    │   └── NotificationToast.jsx  # Real-time alert toasts
    ├── services/
    │   └── api.js             # Client-side Axios API client with JWT interceptors
    └── utils/
        └── validators.js      # Phone, email & input validation helpers
```

---

## ⚡ Quick Start: Running Locally

### 1. Prerequisites
- **Node.js** (v18.x or v20.x recommended): [Download Node.js](https://nodejs.org/)
- **npm** (comes automatically with Node.js)

### 2. Installation
Clone or extract the project, navigate into the directory, and install dependencies:

```bash
npm install
```

### 3. Environment Configuration
Create a `.env` file in the root directory (or copy `.env.example`):

```bash
cp .env.example .env
```

Set your configuration in `.env`:
```env
PORT=3000
JWT_SECRET=your-secret-jwt-key-here
GEMINI_API_KEY=your_gemini_api_key_here
```
*(Note: If `GEMINI_API_KEY` is not provided, the application automatically uses smart local heuristic fallbacks so all features, submission, classification, and administration remain 100% functional).*

### 4. Start the Application
Run the unified dev server:

```bash
npm run dev
```

Open your browser and navigate to: **`http://localhost:3000`**

---

## 👥 Demo Credentials

The application comes pre-loaded with sample accounts:

### 🛡️ Admin Accounts:
- **Phone**: `+919876543220` | **Password**: `Password123`
- **Phone**: `+919876543221` | **Password**: `Password123`

### 👤 Citizen Accounts:
- **Phone**: `+919876543210` | **Password**: `Password123`
- **Phone**: `+919876543214` | **Password**: `Password123`
- **Phone OTP Login**: Enter any registered phone number; demo OTP is `123456`.

---

## 🌐 API Reference (Included in `server.ts`)

### Authentication
- `POST /api/auth/send-otp` - Dispatch phone OTP for authentication
- `POST /api/auth/verify-otp` - Verify OTP and generate JWT session
- `POST /api/auth/login` - Authenticate via phone and password
- `POST /api/auth/register` - Create citizen account
- `GET /api/auth/me` - Fetch authenticated user profile & reputation score

### Citizen Grievances
- `POST /api/grievances` - Submit grievance (multimodal text + image + GPS location)
- `GET /api/grievances` - List current user's submitted grievances
- `GET /api/grievances/:id` - Fetch grievance details with status audit timeline
- `POST /api/ai/analyze-image` - Multimodal photo analysis via Gemini 3.7 Flash
- `GET /api/geocode/reverse` - Reverse GPS geocoding for citizen location capture
- `GET /api/notifications` - Retrieve citizen SMS / notification history

### Admin Management
- `GET /api/admin/grievances` - Filterable list of all grievances with filer contact information
- `PATCH /api/admin/grievances/:id/status` - Update status, upload resolution proof photo, and send SMS
- `PATCH /api/admin/grievances/:id/reclassify` - AI / manual reclassification and department reassignment
- `GET /api/admin/duplicate-clusters` - Grouped duplicate clusters across multiple reporting citizens
- `PATCH /api/admin/duplicate-clusters/:id/status` - Bulk-resolve duplicate clusters & broadcast SMS
- `GET /api/admin/analytics` - Department performance metrics & SLA statistics

---

## 🗄️ Supabase / PostgreSQL Setup (Optional Production Persistence)

To connect an external PostgreSQL database or Supabase instance:
1. Open the Supabase SQL Editor.
2. Run the provided script: **`seed_grievance_db.sql`**.
3. It creates all tables (`users`, `grievances`, `complaint_updates`, `notifications`, `otp_verifications`), sets up enum types, and seeds initial sample records.

---

## 🛠️ Production Build & Deployment

To bundle and build the application for production:

```bash
npm run build
npm run start
```
