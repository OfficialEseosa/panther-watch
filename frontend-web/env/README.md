# Environment Configuration

This folder contains all environment configuration files for the PantherWatch frontend.

## Files:

- `.env.example` - Template showing required environment variables
- `.env.development` - Development environment (git-ignored) 
- `.env.production` - Production environment (git-ignored)

## Setup:

1. Copy `.env.example` to `.env.development`
2. Fill in your actual values:
   ```bash
   VITE_API_BASE=http://localhost:8080
   VITE_GOOGLE_CLIENT_ID=your-actual-google-client-id
   ```

## Note:

Only `.env.example` is tracked in git. All other `.env` files are ignored to protect sensitive credentials.
