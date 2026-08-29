# KMRL AI-Driven Train Induction Planning & Scheduling Platform

> **Smart India Hackathon 2026** — Problem Statement: AI-Driven Train Induction Planning & Scheduling for Kochi Metro Rail Limited (KMRL)

An integrated, algorithm-driven decision-support platform that transforms KMRL's manual nightly induction planning into a reproducible, auditable, data-driven process.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite + TailwindCSS + shadcn/ui |
| Backend | Python FastAPI + OR-Tools CP-SAT + XGBoost |
| Database | Supabase (PostgreSQL + Auth + Realtime + Storage) |
| Deployment | Vercel (frontend) + Railway.app (backend) |

## Features

- ✅ **Fleet Management** — 25 trainsets, fitness certificates, status tracking
- ✅ **Job Card Integration** — Maximo CSV import, open/closed work orders
- ✅ **CP-SAT Optimizer** — Multi-objective constraint programming schedule generation
- ✅ **ML Predictions** — Maintenance risk & mileage demand forecasting (XGBoost)
- ✅ **Branding Tracker** — Contractual exposure hour monitoring
- ✅ **Mileage Balancing** — Fleet-wide km equalisation
- ✅ **What-If Simulator** — Interactive constraint modification & re-optimization
- ✅ **Audit Log** — Full traceability of every action
- ✅ **Role-Based Access** — Supervisor / Operator / Read-Only with Supabase RLS
- ✅ **Real-time Dashboard** — Live updates via Supabase Realtime

## Project Structure

```
├── frontend/          # React + Vite SPA
├── backend/           # FastAPI Python server
├── supabase/
│   └── migrations/    # SQL schema
└── README.md
```

## Setup

### 1. Database
1. Open [Supabase Dashboard](https://supabase.com/dashboard)
2. Navigate to SQL Editor
3. Paste contents of `supabase/migrations/001_initial_schema.sql` and run

### 2. Backend
```bash
cd backend
python -m venv venv
venv\Scripts\activate   # Windows
pip install -r requirements.txt
cp .env.example .env    # Fill in your Supabase keys
uvicorn app.main:app --reload
```

### 3. Frontend
```bash
cd frontend
npm install
cp .env.example .env    # Fill in your Supabase keys + backend URL
npm run dev
```

## Environment Variables

### Backend (`backend/.env`)
```
SUPABASE_URL=https://csktxxwyxjyxavnlnqzh.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
CORS_ORIGINS=http://localhost:5173,https://your-app.vercel.app
```

### Frontend (`frontend/.env`)
```
VITE_SUPABASE_URL=https://csktxxwyxjyxavnlnqzh.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-key>
VITE_API_URL=http://localhost:8000
```

## Deployment

### Backend → Railway.app
1. Push code to GitHub
2. Connect repo to Railway → select `backend/` as root
3. Add environment variables in Railway dashboard

### Frontend → Vercel
1. Connect repo to Vercel → select `frontend/` as root
2. Add environment variables in Vercel dashboard
3. Set `VITE_API_URL` to your Railway backend URL

## Team

Built for Smart India Hackathon 2026
