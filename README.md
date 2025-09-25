# PantherWatch

Modern course tracking for Georgia State University students.

This monorepo contains:
- `backend/` — Spring Boot API (Java 21)
- `frontend-web/` — React + Vite web app
- `frontend-android/` — Android client (not in scope yet)

Quick start:
- Database: `docker compose up -d` (Postgres on 5432)
- Backend: `cd backend && ./mvnw spring-boot:run`
- Frontend: `cd frontend-web && npm install && npm run dev`

Read the project-specific guides:
- Backend: `backend/README.md`
- Frontend Web: `frontend-web/README.md`

Notes:
- Auth is via Supabase (Google OAuth). Frontend needs `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- Backend validates Supabase JWTs and schedules a watcher job to email when seats open (Resend).

Contributing:
- Use focused PRs, follow existing style, and update docs when behavior changes.