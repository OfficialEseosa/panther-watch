# Environment Configuration

The PantherWatch frontend currently requires **no environment variables**.

- Authentication is handled entirely by the backend's Google OAuth flow (no client
  secrets or keys live in the frontend).
- The API base URL is selected in code — see `src/config/apiConfig.js`
  (localhost → `http://localhost:8080/api`, otherwise `https://api.pantherwatch.app/api`).

## Files

- `.env.example` — template for any future client-side variables (tracked in git)
- `.env.development`, `.env.production`, `.env.local` — local overrides (git-ignored)

If you introduce a client-side variable later, prefix it with `VITE_` so Vite exposes it,
document it in `.env.example`, and read it via `import.meta.env.VITE_*`.
