# Styles

> **2026-10-26:** the original design is the baseline again (docs/design/spec.md, top section). `tokens.css` now defines the original `--color-*` tokens (plus the redesign's semantic names as aliases of them). Rules below about "semantic tokens only", "no hex outside tokens.css", the three `min-width` breakpoints and "never `[data-theme]` outside tokens.css" are relaxed: original `max-width` breakpoints (1024/768/600/480) and `:root[data-theme="dark"] .x` overrides for dark variants are fine. The `--kf-*` keyframe rule and `npm run check:css` still apply.

How the design system is wired. The rules themselves live in `docs/design/` (spec.md, motion.md,
pages.md, tokens.css); this file is the map.

## Files

| File | What it is |
|---|---|
| `tokens.css` | Every value: palette, semantic aliases (light on `:root`, dark on `:root[data-theme="dark"]`), type scale, spacing, radius, shadows, z-index, layout sizes, motion tokens, and the reduced-motion overrides. A copy of `docs/design/tokens.css`; change both together. |
| `motion.css` | Shared keyframes (`fade-in`, `rise-in`, `pop-in`, `sheet-in`, `shimmer`, ...) and their `--kf-*` aliases for CSS Modules, the `@property --pw-n` counter, the theme-switch transition suppression and the View Transition rules. |
| `fonts.ts` | Inter via `next/font/google` (`display: swap`), exposed as `--font-inter`. |
| `../app/globals.css` | Imports the two CSS files above, then the reset and base element styles (spec.md §1.11). Nothing else is global. |

Theme: the inline pre-paint script (`components/theme/themeScript.ts`, rendered first in
`<head>` by `app/layout.tsx`) sets `data-theme` on `<html>` before first paint from
`localStorage["pantherwatch.theme"]` or the OS. `ThemeProvider` only reacts to later changes
(user choice, OS change, other tabs) and crossfades with a View Transition.

## Rules (CI-enforceable, spec.md §5)

- Components use **semantic** tokens only (`--bg`, `--surface`, `--text`, `--accent`, `--border`,
  `--success`, ...). No hex/rgb/hsl literals outside `tokens.css`. `color-mix()` only in the
  landing hero (`app/page.module.css`).
- Every `var(--x)` must exist in `tokens.css` (or be a `--kf-*` alias from `motion.css`), or be a
  component-private `--_x` defined in the same rule or set inline from TSX. (`--font-inter` comes
  from next/font.)
- **Never name a shared keyframe directly in a CSS Module.** Lightning CSS (Turbopack's CSS Modules)
  renames every identifier in `animation` / `animation-name` per module (`rise-in` becomes
  `Gga1VW_rise-in`), and the keyframes only exist globally under their plain names, so the
  animation silently does nothing and `animationend` never fires. Use the alias:
  `animation: var(--kf-rise-in) var(--dur) var(--ease-out) both;` /
  `animation-name: var(--kf-fade-in);` (values inside `var()` are not renamed). A keyframe defined
  in the same module (e.g. `Spinner`'s `spin`) is renamed consistently and may be named directly.
  New shared keyframe: add the `@keyframes` and its `--kf-*` alias to `motion.css` together.
- `npm run build && npm run check:css` (`scripts/check-css.mjs`) checks the built CSS: it fails
  when an animation names a keyframe with no `@keyframes` in the output, or a `var(--x)` is
  defined nowhere (CSS declarations, `@property`, or a `"--x"` literal in `src/**/*.ts(x)` for
  inline styles).
- Media queries: `(min-width: 640px | 900px | 1200px)`, `(hover: hover) and (pointer: fine)`,
  `(pointer: coarse)`, `(prefers-reduced-motion: reduce)`, `(forced-colors: active)`. Mobile-first,
  no `max-width`. Never `prefers-color-scheme` or `[data-theme]` outside `tokens.css`; components
  never branch on theme (need a different color in dark? add a semantic token). One exception:
  `components/theme/ThemeToggle.module.css` picks the toggle's sun/moon icon from
  `html[data-theme]`, so the server-rendered button never shows the wrong icon before hydration.
- `z-index: var(--z-*)` only. Transitions/animations use `--dur*` and `--ease*` tokens; raw
  durations only in `tokens.css` / `motion.css` (plus the documented shimmer/spinner loops).
- Hover styles go inside `@media (hover: hover) and (pointer: fine)`.
- Animate `transform` and `opacity`. Movement comes from `--move-*` / `--scale-*` tokens, which are
  zeroed under reduced motion, so most animations need no reduced-motion code of their own.

## Adding a component

1. `src/components/ui/Thing.tsx` + `Thing.module.css` (shell pieces go in `components/shell/`).
   Add `"use client"` only if it uses state, effects, context or browser APIs.
2. Typed props, no `any`. Spread the native element's props (`ComponentProps<"button">`) and pass
   `ref` as a normal prop (React 19).
3. Style with tokens from the table in spec.md §2 for that component. Keep private knobs as
   `--_name` custom properties on the root class.
4. Interaction states: `:focus-visible` uses the global ring (don't restyle it); hover in the
   fine-pointer media query; `:active` scale only on buttons; disabled = `opacity: .5`.
5. Motion: reuse a keyframe from `motion.css` through its alias (`animation: var(--kf-pop-in) ...`,
   never the bare name; see Rules). JS-driven exits use `playExit()` from `lib/ui/motion.ts` (sets
   `data-closing`, resolves on `animationend` or a 300 ms safety timeout). Anything else that waits
   for `animationend` needs its own safety timeout too.
6. Accessibility: icon-only controls need `aria-label` (`IconButton` requires `label`); icons are
   `aria-hidden`; status is never color alone.

## Helpers (`src/lib/ui`)

- `cn(...)`: join class names.
- `motion.ts`: `prefersReducedMotion()`, `withViewTransition(kind, update)`, `playExit(el)`.
- `hooks.ts`: `useMediaQuery(query)`, `useReducedMotion()`.
- `storage.ts`: never-throwing `localStorage` helpers and the UI's storage keys.
- `navEntrance.tsx`: `useNavEntrance()`, true when the (app) page mounted from a client navigation
  (use it to decide whether a list staggers in, motion.md §4.2).
