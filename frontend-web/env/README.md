# Environment Configuration

This folder contains all environment configuration files for the PantherWatch frontend.

## Files:

- `.env.example` — Template showing required environment variables
- `.env.development` — Development environment (git-ignored)
- `.env.production` — Production environment (git-ignored)

## Setup:

1. Copy `.env.example` to `.env.development`
2. Fill in your actual values:
   ```bash
   VITE_SUPABASE_URL=your-supabase-url
   VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
   ```

## Notes:

- Only the two Supabase variables are required by the frontend.
- API base URL is selected in code (`src/config/apiConfig.js`).
- `.env.example` is tracked; other `.env*` files are ignored.