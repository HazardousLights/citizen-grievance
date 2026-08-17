# AI-Based Citizen Grievance Classification System

Citizens submit civic grievances (water, electricity, roads, sanitation, etc.).
Gemini AI classifies the complaint, assigns it to a department, scores urgency
(1–10), detects duplicates via embeddings, and rejects out-of-scope complaints.
Admins track and manage everything from a dashboard.

## Tech stack

- **Frontend**: React + Vite + Tailwind CSS (JavaScript)
- **Backend**: Python + FastAPI
- **Database**: PostgreSQL + pgvector (for duplicate detection embeddings)
- **AI**: Google Gemini API (classification, urgency scoring, embeddings)
- **Auth**: JWT + phone OTP verification

## Project structure

```
project/
├── backend/          FastAPI app, AI service, routes, models, schemas
├── frontend/          React + Vite + Tailwind app
├── .env.example       All environment variables (copy to backend/.env)
└── README.md
```

## Prerequisites

- Python 3.11+
- Node.js 18+
- PostgreSQL 14+ with the `vector` extension available (most managed
  Postgres providers, e.g. Supabase, Neon, or `ankane/pgvector` Docker image,
  support this out of the box)
- A Gemini API key from https://aistudio.google.com/app/apikey (optional —
  the app runs in a keyword-based fallback mode without one, so you can
  demo it without a key)

## 1. Database setup

```bash
createdb grievance_db
```

pgvector's `CREATE EXTENSION` is run automatically on backend startup — no
manual migration step needed for a first run. For schema changes beyond the
initial setup, introduce Alembic.

## 2. Backend setup

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt

cp ../.env.example .env
# Edit .env: set DATABASE_URL, JWT_SECRET, and (optionally) GEMINI_API_KEY

uvicorn app:app --reload
```

Backend runs at `http://localhost:8000`. Interactive API docs at
`http://localhost:8000/docs`.

## 3. Frontend setup

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at `http://localhost:5173` and proxies `/api` and `/uploads`
requests to the backend (see `vite.config.js`).

## 4. Creating an admin user

There's no public "become admin" endpoint by design. Register a normal
account through the UI, then promote it directly in the database:

```sql
UPDATE users SET role = 'admin' WHERE phone = '+91XXXXXXXXXX';
```

## How the AI pipeline works

1. `ai_service/gemini_client.py` sends the complaint text to Gemini with a
   strict-JSON prompt asking for category, urgency, confidence, and
   out-of-scope detection.
2. If the complaint is out-of-scope, it's saved with `status=rejected` and
   the citizen sees a rejection reason (e.g. "contact the police").
3. Otherwise, a Gemini embedding is generated and compared against existing
   grievances in the same category using pgvector cosine similarity
   (`ai_service/utils.py`). Matches above the similarity threshold mark the
   complaint as a likely duplicate.
4. If `GEMINI_API_KEY` is unset or a call fails, the system falls back to a
   keyword-based heuristic (see `_fallback_classify` /
   `_fallback_embedding`) so the app stays functional in dev/demo settings.

## Anti-abuse features

- Max 3 OTP requests/hour per phone number
- Max 3 complaint submissions/day per user
- Users with a rejection rate ≥ 80% are auto-banned
- A CAPTCHA prompt is shown client-side after 2 rejected submissions
  (wire up a real CAPTCHA provider like hCaptcha/reCAPTCHA server-side
  before production use)

## Swapping the AI provider

All AI calls go through `ai_service/base_client.py`'s abstract interface.
To use a different provider, implement `BaseAIClient` in a new file (e.g.
`openai_client.py`) and swap the `ai_client` import in
`routes/grievances.py`.

## Production checklist

- [ ] Replace the mock OTP/notification senders in `auth.py` /
      `routes/grievances.py` with real Twilio/MSG91/SendGrid integrations
- [ ] Move file uploads from local disk (`UPLOAD_DIR`) to S3 or similar
- [ ] Add a real CAPTCHA provider server-side
- [ ] Run Alembic migrations instead of `create_all` for schema changes
- [ ] Put the backend behind HTTPS and set restrictive `CORS_ORIGINS`
- [ ] Rotate `JWT_SECRET` and store secrets in a vault, not `.env`, in prod
