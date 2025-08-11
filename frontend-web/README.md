## PantherWatch Web

This directory contains the React/Vite web frontend for PantherWatch. It provides a browser-based interface for searching GSU course information.

### Tech
- React 19
- Vite 7
- ESLint (basic config in `eslint.config.js`)
- Environment-based API configuration

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
- `.env.development` - Points to local backend (`http://localhost:8080`)
- `.env.production` - Points to live API (`https://api.pantherwatch.app`)

### Deployment
Production builds automatically use the live API endpoint. Deploy the `dist/` folder to any static hosting service.

### Next Steps
- Add authentication flow (if required) with backend
- Introduce a component library or minimal design system
- Add tests (e.g. Vitest + React Testing Library) once UI logic grows
- Implement course result display and filtering

### License
Follow root project licensing (see repository root README / license info).
