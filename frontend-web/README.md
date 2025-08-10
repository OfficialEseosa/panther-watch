## PantherWatch Web (WIP)

This directory contains the experimental web frontend for PantherWatch. The scaffold has been stripped of create-vite sample code so you can build the real UI.

### Tech
- React 19
- Vite 7
- ESLint (basic config in `eslint.config.js`)

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

### Next Steps (suggested)
- Implement authentication flow (if required) with backend
- Add course search UI consuming `/api/courses/search`
- Introduce a component library or minimal design system
- Add environment-based API base URL handling
- Add tests (e.g. Vitest + React Testing Library) once UI logic grows

### License
Follow root project licensing (see repository root README / license info).
