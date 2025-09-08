## PantherWatch Web

This directory contains the React/Vite web frontend for PantherWatch. It provides a browser-based interface for searching GSU course information.

### Tech
- React 19
- Vite 7
- ESLint (basic config in `eslint.config.js`)
- Supabase-based authentication

### Dev Scripts
- `npm run dev`  Start local dev server
- `npm run build`  Production build (outputs to `dist/`)
- `npm run preview`  Preview production build
- `npm run lint`  Run ESLint

### Getting Started
```sh
npm install
npm run dev
```
Then open the displayed local URL (default: http://localhost:5173).

### Environment Configuration
- `.env.development` — set:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
- Production hosting should also set the same two variables.

API base selection is handled in `src/config/apiConfig.js` (localhost → `http://localhost:8080/api`, otherwise `https://api.pantherwatch.app/api`).

### Deployment
Production builds automatically use the live API endpoint. Deploy the `dist/` folder to any static hosting service.

### Next Steps
- Add authentication flow (if required) with backend
- Introduce a component library or minimal design system
- Add tests (e.g. Vitest + React Testing Library) once UI logic grows
- Implement course result display and filtering

### License
Follow root project licensing (see repository root README / license info).
