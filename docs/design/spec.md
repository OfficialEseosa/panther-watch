# PantherWatch design system

> **Superseded 2026-10-26: the owner rejected the redesign; the original design is the baseline.**
>
> The owner's words: "I hate the redesign. It has drifted so much from the original design. I really loved the original page design, card design and image at the back. Now there is too much going on on every page. Keep the original card design but iteratively improve on that, though I like the font changes and the side bar changes." A follow-up asked for visual polish only (contrast, button/card micro-interactions, tinted backgrounds, consistent spacing), not new elements.
>
> Everything from **"Original specification (historical)"** down describes the rejected redesign. Keep it only for its engineering rules that still hold (CSS Modules, no undefined `var()`, `npm run check:css`, keyframes through `--kf-*` aliases, `next/font`, the pre-paint theme script, reduced motion). Its visual rules (tokens, three breakpoints, the gradient/dot-grid hero, stat tiles, Getting started checklist, removed statue) no longer apply.

## The restored design (current)

**Source of truth:** the original React/Vite app's CSS (`frontend-web/src/App.css`, `index.css`, `pages/Home/Home.css`, `pages/Dashboard/Dashboard.css`, `pages/Settings/Settings.css`, `components/Header|Sidebar|AnnouncementBanner/*.css`, `pages/Legal/Legal.css`, `components/CourseResults/CourseResults.css`). When in doubt, match it, then fix the problem listed below if it has one.

**Kept from the redesign:** Inter via `next/font` (`--font-sans`), the sidebar/rail + bottom-nav shell and its navigation (recolored to the original palette), the `data-theme` pre-paint theme mechanism, CSS Modules, the UI-kit component APIs.

### Tokens (`web/src/styles/tokens.css`, mirrored in `./tokens.css`)

The original `App.css` `:root`, verbatim names:

| Token | Light | Dark (`:root[data-theme="dark"]`, the old `.theme-dark`) |
|---|---|---|
| `--color-primary-900 / 700 / 600 / 500` | `#0b1c3d` / `#0f2f61` / `#0039a6` / `#1f5fc3` | same |
| `--color-primary-300 / 100` | `#7fa9e6` / `#e4eef9` | `#4668a8` / `#1c2f52` |
| `--color-page-background` | `#f5f6fb` | `#11234e` |
| `--color-surface` / `--color-surface-muted` | `#ffffff` / `#f1f4f9` | `#0b1625` / `#152a45` |
| `--color-border` / `--color-border-strong` | `#d6deeb` / `#b5bfd3` | `#1e3352` / `#2f4a6d` |
| `--color-text` / `--color-text-muted` / `--color-heading` | `#1f2937` / `#4b5563` / `#152044` | `#e4ecf8` / `#9db2d2` / `#f7fbff` |
| `--color-success` / `--color-warning` / `--color-danger` | `#17703f`* / `#94570a`* / `#b42318` | `#5cc98a` / `#f2b84b` / `#ff8a7f`* |
| `--shadow-xs / sm / md` | `0 1px 0 rgba(15,23,42,.06)` / `0 2px 6px rgba(15,23,42,.08)` / `0 12px 30px rgba(15,23,42,.12)` | `0 1px 0 rgba(0,0,0,.4)` / `0 6px 16px rgba(3,10,22,.45)` / `0 20px 40px rgba(3,10,22,.6)` |
| `--radius-sm / md / lg` | `6px / 10px / 16px` | same |
| `--transition-base` | `150ms ease` | same |

\* changed for contrast (see below). Also defined, because the old CSS used them without defining them: `--color-primary-50`, `--color-primary-400`, `--color-primary`, `--color-primary-dark`, `--color-bg`, `--color-card-bg`, `--card-bg`, `--hover-bg`, `--border-color`, `--text-primary`, `--text-secondary`, `--color-gray-100`, `--color-gray-400`. Small additions so dark mode stays token-driven: `--color-focus-ring`, `--color-success-bg / -warning-bg / -danger-bg` (tints), `--color-overlay`, `--color-on-primary`, `--color-surface-translucent` (panel behind text over the statue), `--color-banner-*` (announcement gradients), `--statue-opacity` (0.04 light / 0.06 dark).

The redesign's semantic names (`--bg`, `--surface`, `--text`, `--accent`, `--border`, `--success`, ...) still exist as **aliases of the original values**, so older component CSS renders in the original palette. Spacing, type-scale, z-index, layout and motion tokens are unchanged. New CSS should prefer the `--color-*` names. Breakpoints: the original `max-width` 1024 / 768 / 600 / 480 are fine again.

### Look

- **Background:** `body::before` draws the statue (`/brand/statue.avif|webp|jpg`, 1600 px, ≤ 80 KB avif/webp) fixed, `cover`, `center top`, at `--statue-opacity`. Page wrappers are transparent; cards are opaque.
- **Cards:** surface, 1 px `--color-border`, `--radius-lg`, `--shadow-sm`, 24 px padding; interactive cards lift 4 px to `--shadow-md`. Icon tiles: 48–56 px, 14 px radius, `--color-primary-100` fill, primary text.
- **Buttons:** 6 px radius, semibold; primary = `--color-primary-600` → `--color-primary-500` on hover, `--color-primary-700` on press, scale 0.98; secondary = surface + border → muted surface. `lg` (landing) lifts 2 px with the blue glow.
- **Modal:** centered card, 10 px radius, `0 10px 40px rgba(0,0,0,.2)`, 50% black overlay, fade + slide-up 0.2 s, at every width (no bottom sheet).
- **Pages:** Home = old Home (header, hero, highlights pills, four feature cards, footer) with the sample course card beside the hero copy (a 3D card: click/Enter/Space flips it to the panther on GSU blue, the mouse tilts it ±8°, it floats when idle; reduced motion = instant swap, no tilt or float); Dashboard = guest notice, greeting card with the tracked count, three feature cards, the one-time 3D What's new showcase; Settings = old section cards (Profile, Appearance, Notifications, Account actions with action rows); Legal = old single 820 px column.

### Problems in the original that the restore fixes

- Warning text `#b36b09` was 4.0:1 on white → `#94570a` (5.8:1); success `#1d814c` was 4.4:1 on its tint → `#17703f`.
- Dark mode kept light-theme success/warning/danger and `--color-primary-300` `#4668a8` (≈3:1 as text on `#0b1625`): dark now has its own status colors and uses `#7fa9e6` for accent text (links, active nav, icons).
- Undefined variables (`--color-primary-400`, `--color-gray-*`, `--border-color`, `--text-secondary`, ...) silently fell back; all are defined now.
- Announcement gradients `#4a90e2` / `#f5a623` carried white text at ~3:1 → brand/status gradients ≥ 4.5:1.
- Locked dashboard cards faded the whole card to 0.72 (text below 4.5:1) and disabled their button: now full contrast, lock icon, button goes to sign-in.
- Hero copy sat directly on the statue/gradient: it now has a faint translucent surface panel.
- Settings action rows only dimmed to 0.7 on hover: now a tinted hover row + press.
- Removed noise: the pulsing hero glow, the dot grid and the 80 px line grid on the landing page; staggered fade-ups (one fade per block now); the redesign's page-enter animation.
- Statue was 343 KB JPEG; now ≤ 80 KB AVIF/WebP with a 106 KB JPEG fallback.

---

# Original specification (historical)


Status: approved for implementation · Owner: design lead · Date: 2026-10-25
Companion files: [`tokens.css`](./tokens.css) (the values, ready to import), [`motion.md`](./motion.md), [`pages.md`](./pages.md).

This document is prescriptive. Where it says "use X", the implementation uses X. Where something is not covered, pick the closest existing pattern and add it here in the same PR.

The brand stays as it is: GSU blue, the panther mark, Inter. The job is to tighten what exists. That means one token set, one theming mechanism, three breakpoints, real contrast numbers, and fewer one-off styles. Visually the new app should read as the same product, cleaner.

---

## 0. What changes from the old app, and why

| Old app problem (audit §5, §6) | New rule |
|---|---|
| 29 tokens on `:root`, `.theme-dark` class applied in an effect after first paint (theme flash) | One token file. `data-theme` on `<html>` set by an inline pre-paint script (§1.2.4). `.theme-dark` is gone. |
| Undefined variables silently ignored: `--color-primary-50`, `--color-primary-400`, `--color-card-bg`, `--color-bg`, `--color-gray-100/400`, `--border-color`, `--text-secondary` | All of these map to defined tokens (§1.2.5). CI check rejects any `var(--x)` that tokens.css doesn't define (§5). |
| Second private theme in `Tutorial.css` (`--card-bg`, `--text-primary`, `[data-theme="dark"]` never set) | Deleted. The coach-mark tutorial is replaced by a checklist card (pages.md, Dashboard). No component defines theme variables. |
| ~160 hex + 113 `rgba()` literals | Zero color literals outside `tokens.css`. Data-viz colors are tokens too (`--grade-*`, `--sched-*`). |
| Global class collisions (`.btn-primary`, `.modal-overlay`, `.badge`, `.spinner`, ...) | CSS Modules. Every component in §2 exists once. |
| Breakpoints at 480/560/600/640/768/900/1024/1100 | Three: 640, 900, 1200, mobile-first `min-width` (§1.8). |
| Inter via render-blocking `@import` | `next/font/google`, self-hosted, `display: 'swap'`, metric-matched fallback (§1.3). |
| `statue.jpg` 343 KB at 4% opacity behind every page | Removed. Background is `--bg`. Landing hero uses a CSS gradient (§1.10). |
| `favicon.png` / `panther.png` 69 KB each | Resized derivatives, ~3 KB each (§1.10). |
| framer-motion 127 KB on every page; `layoutId` on every card | Removed. CSS + View Transitions. See motion.md. |
| `@keyframes fadeIn` ×3, `slideUp` ×2 | One keyframe set in `app/motion.css` (motion.md §3). |
| Schedule block colors with white text at 3.3–3.7:1 (teal, orange, green, cyan) | New block palette, all ≥ 5:1 (§2.17). |
| Text as small as 0.58rem (9.3 px) on the mobile card | Minimum text size 12 px (`--text-xs`). |

---

## 1. Foundations

### 1.1 Principles

1. **Data first.** Seat counts, times and grades are the product. They get the strongest type, tabular numerals, and never sit behind an interaction.
2. **One surface step at a time.** `--bg` → `--surface` → `--surface-2`. Cards don't nest cards.
3. **Color means something.** Blue = interactive/brand. Green/amber/red = seat or grade status. Nothing is decorated with status colors.
4. **Quiet motion.** Motion confirms an action or explains where something went. No ambient animation. See motion.md.
5. **Server first.** If it can be server-rendered, it is. Skeletons only exist where data is genuinely client-fetched or streamed.

### 1.2 Color

All values live in `tokens.css`. Hex is listed here for review; the CSS file is the source of truth if they ever disagree (they don't today).

#### 1.2.1 Palette

**Primary (GSU blue).** 600 is the brand blue, PMS 293, the same blue as in the panther mark.

| Token | Hex | Token | Hex |
|---|---|---|---|
| `--blue-50` | `#EEF3FC` | `--blue-500` | `#1F5FC3` |
| `--blue-100` | `#DCE6F9` | `--blue-600` | `#0039A6` |
| `--blue-200` | `#BCD0F4` | `--blue-700` | `#002F8A` |
| `--blue-300` | `#8AB0F0` | `--blue-800` | `#062670` |
| `--blue-400` | `#4A80E3` | `--blue-900` | `#0B1C3D` |

**Neutral.** Cool slate with a slight blue cast, matching the old `#f5f6fb` page tone.

| Token | Hex | Token | Hex |
|---|---|---|---|
| `--neutral-0` | `#FFFFFF` | `--neutral-500` | `#7D889C` |
| `--neutral-50` | `#F5F7FB` | `--neutral-600` | `#5E6A82` |
| `--neutral-100` | `#ECF0F6` | `--neutral-700` | `#4F5B72` |
| `--neutral-200` | `#DDE3ED` | `--neutral-800` | `#2A3650` |
| `--neutral-300` | `#C0C9D7` | `--neutral-900` | `#172036` |
| `--neutral-400` | `#98A4B8` | `--neutral-950` | `#0B1222` |

**Status.**

| Step | Success (`--green-*`) | Warning (`--amber-*`) | Danger (`--red-*`) |
|---|---|---|---|
| 50 | `#ECF8F1` | `#FEF6E7` | `#FEF1F0` |
| 100 | `#D3F0DF` | `#FCE7BF` | `#FDDCD9` |
| 300 | `#5CC98A` | `#F2B84B` | `#FF8A7F` |
| 500 | `#1F9D5A` | `#D9900F` | `#D93A2B` |
| 700 | `#13703A` | `#96550A` | `#B42318` |
| 800 | `#1F5137` | `#5C3A0A` | `#6B1D16` |
| 900 | `#0F2A1D` | `#2B1F0A` | `#3A1512` |

**Surface / elevated / overlay.** Light surfaces come from the neutral scale. Dark surfaces are a separate "night" ramp, because a navy-tinted dark UI needs steps the neutral scale doesn't have.

| Role | Light | Dark |
|---|---|---|
| Page (`--bg`) | `--neutral-50` `#F5F7FB` | `--night-0` `#0B1222` |
| Surface (`--surface`) | `--neutral-0` `#FFFFFF` | `--night-1` `#121B2F` |
| Surface 2 (`--surface-2`) | `--neutral-100` `#ECF0F6` | `--night-2` `#1A2439` |
| Elevated (`--surface-elevated`) | `--neutral-0` `#FFFFFF` + shadow | `--night-3` `#1E2942` + shadow |
| Overlay (`--overlay`) | `rgb(11 18 34 / 0.48)` | `rgb(3 6 14 / 0.66)` |
| Accent tint (dark only) | n/a | `--night-accent` `#16264A`, hover `#1C2F59`, border `#27427A` |

Dark-mode fix vs the old app: the old dark page (`#11234E`) was *lighter and more saturated* than the dark cards (`#0B1625`), so cards looked like holes. The new ramp goes up in lightness with elevation.

**Data colors.**

- Grades (fills only, always next to a letter label): A `#1F9D5A`, B `#4A80E3`, C `#E0A52B`, D `#E07A2B`, F `#D93A2B` (`--grade-a`…`--grade-f`). Same in both themes.
- Schedule blocks: see §2.17.
- Rate My Professors chip: `--rmp-bg #000000`, `--rmp-text #FFFFFF`.

#### 1.2.2 Semantic aliases

Components use these, and only these, for color. Palette tokens are for `tokens.css` and data-viz code.

| Alias | Purpose | Light | Dark |
|---|---|---|---|
| `--bg` | Page background | `#F5F7FB` | `#0B1222` |
| `--surface` | Cards, sidebar, inputs | `#FFFFFF` | `#121B2F` |
| `--surface-2` | Muted panels, table headers, hover fills | `#ECF0F6` | `#1A2439` |
| `--surface-elevated` | Modals, sheets, menus, toasts, popovers | `#FFFFFF` | `#1E2942` |
| `--overlay` | Modal backdrop | 48% night | 66% night |
| `--text` | Body and headings | `#172036` | `#ECF0F6` |
| `--text-muted` | Secondary text, labels | `#4F5B72` | `#98A4B8` |
| `--text-subtle` | Placeholders, tertiary meta, disabled labels | `#5E6A82` | `#8A96AB` |
| `--text-inverse` | Text on `--text`-colored fills (tooltips) | `#FFFFFF` | `#0B1222` |
| `--border` | Dividers, card outlines (decorative) | `#DDE3ED` | `#2A3650` |
| `--border-strong` | Input/checkbox outlines (must reach 3:1) | `#7D889C` | `#7D889C` |
| `--accent` | Primary button fill, links-as-buttons | `#0039A6` | `#1F5FC3` |
| `--accent-hover` | | `#002F8A` | `#2A68CC` |
| `--accent-active` | | `#062670` | `#0039A6` |
| `--accent-contrast` | Text/icons on `--accent` | `#FFFFFF` | `#FFFFFF` |
| `--accent-text` | Inline links, accent-colored text on surfaces | `#0039A6` | `#8AB0F0` |
| `--accent-subtle` | Selected nav item, CRN tag, info banner bg | `#EEF3FC` | `#16264A` |
| `--accent-subtle-hover` | | `#DCE6F9` | `#1C2F59` |
| `--accent-subtle-text` | Text on `--accent-subtle` | `#0039A6` | `#A9C4F5` |
| `--accent-subtle-border` | Border around `--accent-subtle` | `#BCD0F4` | `#27427A` |
| `--indicator` | Selected-state marks: nav bar, tab underline, checked fill, selected chip border | `#0039A6` | `#8AB0F0` |
| `--indicator-contrast` | Check glyph / switch thumb on `--indicator` | `#FFFFFF` | `#0B1222` |
| `--focus-ring` | Focus outline | `#1F5FC3` | `#8AB0F0` |
| `--success` / `-subtle` / `-border` | Seats open, success toast | `#13703A` / `#ECF8F1` / `#D3F0DF` | `#5CC98A` / `#0F2A1D` / `#1F5137` |
| `--warning` / `-subtle` / `-border` | Few seats, partial data, warning banner | `#96550A` / `#FEF6E7` / `#FCE7BF` | `#F2B84B` / `#2B1F0A` / `#5C3A0A` |
| `--danger` / `-subtle` / `-border` | Full, errors, conflicts (text/icon) | `#B42318` / `#FEF1F0` / `#FDDCD9` | `#FF8A7F` / `#3A1512` / `#6B1D16` |
| `--danger-fill` / `-fill-hover` / `-contrast` | Destructive button | `#B42318` / `#9A1C12` / `#FFFFFF` | `#B42318` / `#C4301F` / `#FFFFFF` |
| `--meter-track` / `-open` / `-low` / `-full` | Enrollment meter | `#DDE3ED` / `#1F9D5A` / `#D9900F` / `#D93A2B` | `#2A3650` / `#5CC98A` / `#F2B84B` / `#FF8A7F` |
| `--skeleton` / `--skeleton-shine` | Loading placeholders | `#ECF0F6` / white 60% | `#1A2439` / white 6% |
| `--selection` | `::selection` background | `#DCE6F9` | `#27427A` |

Why `--accent` and `--indicator` are separate: in dark mode the button blue `#1F5FC3` is only 2.85:1 against `#121B2F`. That's fine for a filled button, whose white label carries the meaning. It's not fine for a 2–3 px "you are here" bar, which has to reach 3:1 on its own. Selected-state marks use `--indicator` (7.80:1).

#### 1.2.3 Usage rules

- Headings use `--text`. The old `--color-heading` is gone; weight and size do the work.
- Never put `--text-muted` on `--accent-subtle`. Use `--accent-subtle-text` or `--text`.
- Status text uses the tone token (`--success`, `--warning`, `--danger`), never the 500 fill.
- Tinted backgrounds come from `-subtle` tokens. Don't write `color-mix()` in components. The one exception is the landing hero gradient (§1.10), which is written once.
- In light mode, depth comes from a shadow on `--surface`. In dark mode it comes from the lighter surface step (`--surface-elevated`) plus the shadow token.

#### 1.2.4 Theming mechanism

- Storage key stays `pantherwatch.theme` (no migration). Values: `"light" | "dark" | "system"`. Missing means `"system"`.
- `app/layout.tsx` renders `<html lang="en" className={inter.variable} suppressHydrationWarning>` and, as the first child of `<head>`, this inline script. It is under 300 bytes and must not be deferred.

```html
<script>(function(){var d=document.documentElement,t;try{t=localStorage.getItem('pantherwatch.theme')}catch(e){}if(t!=='light'&&t!=='dark'){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}d.dataset.theme=t})()</script>
```

- `ThemeProvider` (client) exposes `{ preference, resolved, setPreference }`. When the preference is `"system"`, it subscribes to `matchMedia('(prefers-color-scheme: dark)')` change events and rewrites `data-theme` live.
- The theme switch runs inside a view transition. See motion.md §4.12.
- `tokens.css` selectors: `:root` (light) and `:root[data-theme="dark"]`. No other file may use `[data-theme]` or `prefers-color-scheme`. Components never branch on theme. If a component needs a different color in dark mode, it needs a new semantic token.
- `color-scheme` is set per theme in tokens.css, so native scrollbars, date inputs and `<select>` popups match.

#### 1.2.5 Old → new token map (for porting CSS)

| Old | New |
|---|---|
| `--color-page-background`, `--color-bg`* | `--bg` |
| `--color-surface`, `--color-card-bg`* | `--surface` |
| `--color-surface-muted`, `--color-gray-100`* | `--surface-2` |
| `--color-text`, `--color-heading` | `--text` |
| `--color-text-muted`, `--text-secondary`* | `--text-muted` |
| `--color-gray-400`* | `--text-subtle` |
| `--color-border`, `--border-color`* | `--border` |
| `--color-border-strong` | `--border-strong` |
| `--color-primary-600`, `--color-accent` | `--accent` (fills) / `--accent-text` (text) |
| `--color-primary-500` hover | `--accent-hover` |
| `--color-primary-700` | `--accent-hover` |
| `--color-primary-100`, `--color-primary-50`* | `--accent-subtle` |
| `--color-primary-300`, `--color-primary-400`* | `--accent-subtle-border` (borders) / `--border-strong` (hover borders) |
| `--color-success/warning/danger` | `--success` / `--warning` / `--danger` |
| `#c27b12` literals (low seats) | `--warning` |
| `--shadow-xs/sm/md` | `--shadow-xs/sm/md` (new values) |
| `--radius-sm/md/lg` | `--radius-sm/md/lg` (6/10/16, unchanged) |
| `--transition-base` (150ms ease) | `var(--dur-fast) var(--ease-standard)` |
| `--announcement-banner-height` (JS-measured) | Removed. The banner is in normal flow (§3.1). |

\* = was undefined in the old app.

### 1.3 Typography

**Loading.** `app/fonts.ts`:

```ts
import { Inter } from 'next/font/google';
export const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-inter' });
```

Inter is a variable font, so don't list weights. next/font self-hosts it, preloads it, and generates a metric-matched fallback (`adjustFontFallback`), which keeps the swap shift near zero. `--font-sans` in tokens.css reads `var(--font-inter, "Inter")` and then the system stack.

**Scale** (16 px root, never change the root size):

| Token | Size | Line height token | Use |
|---|---|---|---|
| `--text-xs` | 12 px | `--leading-xs` 16 px | Badges, captions, meter labels, bottom-nav labels. Minimum size anywhere. |
| `--text-sm` | 14 px | `--leading-sm` 20 px | UI default: buttons, inputs on ≥640, nav, card meta, table cells |
| `--text-base` | 16 px | `--leading-base` 24 px | Body copy, inputs on <640 (prevents iOS zoom), descriptions |
| `--text-md` | 18 px | `--leading-md` 26 px | Card titles, modal section titles |
| `--text-lg` | 20 px | `--leading-lg` 28 px | Modal title, empty-state title |
| `--text-xl` | 24 px | `--leading-xl` 32 px | Page title (<900), stat values |
| `--text-2xl` | 30 px | `--leading-2xl` 36 px | Page title (≥900) |
| `--text-3xl` | 36 px | `--leading-3xl` 40 px | Landing section titles |
| `--text-display` | 36→56 px fluid | `--leading-display` 1.08 | Landing hero h1 only |

**Weights:** 400 body, 500 nav/labels, 600 buttons/titles/emphasis, 700 numbers that matter (seat count, GPA, stats) and the hero. No 800.

**Tracking:** `--tracking-tight` (−0.02em) on `--text-xl` and up. `--tracking-caps` (0.06em) on uppercase labels, which are only ever `--text-xs` + 600 + `--text-muted`.

**Numerals:** `font-variant-numeric: tabular-nums` on every number that sits in a column or changes (seats, times, CRN, GPA, counts, stats).

**Measure:** body text max 68ch. Legal pages 72ch.

### 1.4 Spacing

4 px base: `--space-0-5` 2 · `--space-1` 4 · `--space-2` 8 · `--space-3` 12 · `--space-4` 16 · `--space-5` 20 · `--space-6` 24 · `--space-8` 32 · `--space-10` 40 · `--space-12` 48 · `--space-16` 64 · `--space-20` 80 · `--space-24` 96. `--space-px` is 1 px, for hairline offsets only.

Defaults: inline gap in controls `--space-2`. Card padding `--space-5` (≥640) / `--space-4` (<640). Gap between cards `--space-4` (<900) / `--space-6` (≥900). Gap between page sections `--space-8`. Page gutter `--gutter` (`clamp(16px, 4vw, 32px)`).

### 1.5 Radius

`--radius-xs` 4 (meter, skeleton lines, tooltip arrow) · `--radius-sm` 6 (inputs, small buttons, calendar blocks) · `--radius-md` 10 (buttons, chips-as-squares, menus, toasts, nav items) · `--radius-lg` 16 (cards) · `--radius-xl` 24 (modals, sheet top corners) · `--radius-full` (pills, avatars, badges, meter track).

### 1.6 Shadows

Five levels, defined separately per theme in tokens.css:

| Token | Use |
|---|---|
| `--shadow-xs` | Resting cards, secondary buttons |
| `--shadow-sm` | Sidebar edge, sticky filter bar when stuck |
| `--shadow-md` | Card hover, menus, autocomplete list |
| `--shadow-lg` | Toasts, drawers, popovers |
| `--shadow-xl` | Modals and sheets |

Dark shadows are darker, and each adds a 1 px top inner highlight (`inset 0 1px 0 rgb(255 255 255 / .03–.06)`) so elevated panels separate from the night background.

### 1.7 Z-index

Never write a raw number. Use the tokens:

| Token | Value | Layer |
|---|---|---|
| `--z-base` | 0 | Normal flow |
| `--z-raised` | 1 | Action buttons over a card's stretched link, hovered calendar block |
| `--z-sticky` | 100 | Results filter bar, calendar day header |
| `--z-header` | 200 | Mobile top bar |
| `--z-nav` | 300 | Sidebar, rail, bottom nav |
| `--z-drawer` | 400 | Rail's overlay drawer and its scrim |
| `--z-overlay` | 500 | Non-dialog scrims (unused by default; `<dialog>` uses the top layer) |
| `--z-modal` | 600 | Reserved; dialogs are in the top layer |
| `--z-popover` | 700 | Positioned popovers not using the Popover API |
| `--z-toast` | 800 | Toast region (also a top-layer popover, see §2.11) |
| `--z-tooltip` | 900 | Tooltips |
| `--z-skip-link` | 1000 | Skip link on focus |

Modals use `<dialog>.showModal()` and menus use `popover`. Both render in the browser top layer, so z-index fights between overlays mostly go away. The tokens exist for in-page stacking.

### 1.8 Breakpoints

Three breakpoints, mobile-first, `min-width` only:

| Name | Value | What changes |
|---|---|---|
| base | 0–639 | Bottom nav, top bar, single column, modals become bottom sheets, calendar shows agenda by default |
| `sm` | ≥ 640 px | Centered modals, two-column forms, week calendar by default |
| `md` | ≥ 900 px | Bottom nav and top bar replaced by the 72 px icon rail, two-column course grid |
| `lg` | ≥ 1200 px | Full 248 px sidebar |

CSS custom properties don't work inside `@media`, so write the literals: `@media (min-width: 640px)`, `(min-width: 900px)`, `(min-width: 1200px)`. These three are the only allowed widths. `max-width` queries are not allowed (CI-enforced, §5). `--bp-sm/md/lg` in tokens.css are for `matchMedia` in JS (`useMediaQuery('(min-width: 640px)')`).

Components that live in variable-width containers use container queries instead of viewport queries. Example: CourseCard is `container-type: inline-size` and switches to its compact layout under `@container (max-width: 359px)`. Container query widths are component-specific and not limited to the three breakpoints.

Pointer: hover effects go inside `@media (hover: hover) and (pointer: fine)`. On `(pointer: coarse)`, every interactive target is at least `--tap-min` (44 px), using a transparent `::after` hit area where the visual is smaller.

### 1.9 Icons

Keep the existing custom `Icon` set, cleaned up per audit §4. Merge `x`/`close`, `check`/`checkmark` and `users`/`people`. Add `play`, `chevronLeft`, `chevronRight` and `chevronUp` instead of rotating `chevronDown` inline. Delete `classes` and `edit` if still unused. Rules: 24×24 viewBox, 1.75 stroke, `currentColor`, rendered at 16 (in `sm` controls and badges), 20 (default) or 24 (bottom nav, empty states). Decorative icons get `aria-hidden`. An icon-only control's name comes from the control's `aria-label`, never from the SVG.

### 1.10 Imagery and brand assets

- **Panther mark** (`panther.png`, 900×713, 69 KB). Generate `public/brand/panther-64.webp` and `panther-128.webp` (each ≈ 3–6 KB) and render with `next/image` at 32 px (sidebar, top bar) or 40 px (landing header), `priority` on the landing page only. App icons use Next conventions: `app/icon.png` (64×64), `app/apple-icon.png` (180×180). Delete `public/favicon.png`.
- **Statue photo** (`statue.jpg`, 343 KB). Removed from the product, with no replacement image. The faint-statue effect cost a 343 KB download to put 4% opacity behind content. The new background is `--bg`, flat.
- **Landing hero background:** CSS only, defined once in `Home.module.css`:

```css
.hero { position: relative; isolation: isolate; background: var(--bg); }
.hero::before {                       /* decoration layer; the mask must not touch hero content */
  content: ''; position: absolute; inset: 0; z-index: -1; pointer-events: none;
  background:
    radial-gradient(60% 55% at 50% 0%, color-mix(in srgb, var(--accent) 16%, transparent), transparent 70%),
    radial-gradient(var(--border) 1px, transparent 1px) 0 0 / 24px 24px;
  mask-image: linear-gradient(to bottom, black 55%, transparent);   /* fade out toward the hero bottom */
}
```

  It is static, with no animation. In dark mode the same rule renders a deeper glow automatically, because `--accent` and `--border` are theme tokens.
- **Open question for the owner (not a design decision):** the panther artwork carries a ™ and appears to be a GSU Athletics mark, while the footer states the site is not affiliated with GSU. This spec keeps the mark as it is. If the owner wants to reduce trademark exposure, the fallback is a wordmark plus a generic paw glyph in `--accent`, and nothing else in this spec changes.

### 1.11 Global base styles

`app/globals.css`, imported once in `app/layout.tsx`:

```css
@import "./tokens.css";
@import "./motion.css";           /* keyframes + view-transition rules, see motion.md §3 */

*, *::before, *::after { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; scrollbar-gutter: stable; }
html:has(dialog[open]) { overflow: hidden; }
body {
  margin: 0; min-height: 100dvh;
  background: var(--bg); color: var(--text);
  font-family: var(--font-sans); font-size: var(--text-base); line-height: var(--leading-base);
  -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;
}
h1, h2, h3, h4, p, figure { margin: 0; }
img, svg, video { display: block; max-width: 100%; }
button, input, select, textarea { font: inherit; color: inherit; }
a { color: var(--accent-text); text-underline-offset: 2px; }
:focus-visible { outline: var(--ring-width) solid var(--focus-ring); outline-offset: var(--ring-offset); }
:focus:not(:focus-visible) { outline: none; }
::selection { background: var(--selection); }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0; }
```

No `transition` on `body` or on `*`. The old global `transition: background-color 0.3s` on body, inputs and buttons is what made theme switching smear.

---

## 2. Components

Each spec gives anatomy, states, and the tokens it consumes. Sizes are in px. "Ring" always means the global `:focus-visible` outline, never a custom box-shadow. Every component lives in `components/<Name>/<Name>.tsx` with a co-located `<Name>.module.css`.

### 2.1 Button

**Anatomy:** `[leading icon?] label [trailing icon?]`. The label is required. Use IconButton when there is no label.

| Size | Height | Padding-x | Font | Icon | Gap |
|---|---|---|---|---|---|
| `sm` | 32 (`--control-h-sm`) | 12 | `--text-sm` / 600 | 16 | 6 |
| `md` (default) | 40 (`--control-h-md`) | 16 | `--text-sm` / 600 | 20 | 8 |
| `lg` | 48 (`--control-h-lg`) | 20 | `--text-base` / 600 | 20 | 8 |

Radius `--radius-md`. Use `lg` only on the landing hero and on empty-state primary actions.

| Variant | Rest | Hover | Active |
|---|---|---|---|
| `primary` | bg `--accent`, text `--accent-contrast` | bg `--accent-hover` | bg `--accent-active` |
| `secondary` | bg `--surface`, 1 px `--border`, text `--text`, `--shadow-xs` | bg `--surface-2`, border `--border-strong` | bg `--surface-2` |
| `ghost` | transparent, text `--text-muted` | bg `--surface-2`, text `--text` | bg `--surface-2` |
| `danger` | bg `--danger-fill`, text `--danger-contrast` | bg `--danger-fill-hover` | same as hover |
| `danger-ghost` | transparent, text `--danger` | bg `--danger-subtle` | same as hover |

**States:**
- `:active`: `transform: scale(var(--scale-press))` over `--dur-instant`.
- `:focus-visible`: ring.
- `disabled`: `opacity: .5`, `cursor: not-allowed`, no hover change. Prefer *not* disabling. See CourseCard guest behaviour.
- `loading` (`aria-busy="true"`): a 16 px spinner replaces the leading icon. The label stays and the button keeps its width (min-width locked at the moment loading starts). Clicks are ignored.

Full-width on mobile only where pages.md says so.

### 2.2 IconButton

Square, same heights as Button (`sm` 32, `md` 40), icon 16/20, radius `--radius-md`. Variants: `ghost` (default), `outline` (1 px `--border`, bg `--surface`) and `danger-ghost`. `aria-label` is required, and it also feeds the Tooltip (§2.20).

Toggle form (`aria-pressed`): pressed = bg `--accent-subtle`, text `--accent-subtle-text`, 1 px `--accent-subtle-border`. Hover in pressed state = `--accent-subtle-hover`. Used for the CourseCard schedule toggle, Week/Agenda and similar.

On coarse pointers, `sm` gets an `::after { inset: -6px }` hit area to reach 44 px.

### 2.3 Input, Select, Textarea

**Field anatomy:** `label` (text-sm/600/`--text`, 6 px below) → control → `hint` or `error` (text-xs, `--text-muted` or `--danger`, 6 px above). Error text starts with the `alert` icon (16). The control has `aria-describedby` pointing at the hint/error and `aria-invalid` when in error.

**Control:** height 40, padding-x 12, radius `--radius-md`, bg `--surface`, 1 px `--border-strong`, text `--text`, placeholder `--text-subtle`. Font `--text-base` below 640 (iOS doesn't zoom on focus at 16 px), `--text-sm` at ≥640.

| State | Treatment |
|---|---|
| hover | border `--text-subtle` |
| focus | border `--accent`, plus the ring with `outline-offset: 1px` |
| invalid | border `--danger`; on focus the ring stays `--focus-ring` |
| disabled | bg `--surface-2`, text `--text-subtle`, border `--border` |
| read-only | bg `--surface-2`, normal text |

**Select:** a native `<select>` with `appearance: none`, padding-right 36, and a `chevronDown` Icon (16, `--text-muted`) absolutely positioned in a wrapper span with `pointer-events: none`. Keep it native for mobile pickers.

**Textarea:** same tokens, min-height 120, `resize: vertical`, padding 12.

### 2.4 Autocomplete (subject multi-select)

Replaces `SubjectAutocomplete`. Follows the ARIA 1.2 combobox pattern with a listbox popup.

**Anatomy:** field shell (looks like Input, min-height 40, wraps) containing selected subjects as removable Chips (§2.10), then the text input (`role="combobox"`, `aria-expanded`, `aria-controls`, `aria-activedescendant`, `aria-autocomplete="list"`). Below it sits the listbox popup: bg `--surface-elevated`, 1 px `--border`, `--shadow-md`, radius `--radius-md`, max-height 320, scrolls, 4 px padding. Options are 36 tall with padding-x 12; each shows the code (600, tabular) and the description (`--text-muted`).

**Data:** the subject list for a term (≈ 150 rows) is fetched once per term and filtered client-side. No request per keystroke (the old component fetched on every keystroke and could display out-of-order results). Match order: code prefix first, then description word-prefix, then description substring.

**States:** option highlighted = bg `--accent-subtle`, text `--accent-subtle-text`. Option already selected = check icon at the end, and choosing it again removes it. Empty = "No subjects match "ab"" row (not selectable). Loading (first open before the list arrives) = 3 skeleton rows.

**Keyboard:** `↓`/`↑` move the highlight (wrapping), and `↓` opens the list when closed. `Enter` selects the highlighted option and keeps the list open for multi-select. `Esc` closes the list, and a second `Esc` clears the text. `Backspace` on an empty input removes the last chip. `Tab` closes the list and moves on without selecting. `Home`/`End` move within the text input, not the list.

Max 5 subjects. The 6th attempt shows hint text "Up to 5 subjects".

### 2.5 Card

Container: bg `--surface`, 1 px `--border`, radius `--radius-lg`, `--shadow-xs`, padding `--space-5` (≥640) / `--space-4`. Optional `header` / `footer` slots separated by a 1 px `--border` rule (no separate muted header band; the old cards had one and it added height without information).

**Interactive card** (whole card navigates or opens something). Use the stretched-link pattern: the primary link or button is the card title, and its `::after { position:absolute; inset:0 }` covers the card. Secondary controls get `position: relative; z-index: var(--z-raised)`. Never `role="button"` on the card itself (the old CourseCard nested buttons inside `role="button"`, which is invalid).
- Hover (fine pointer): `translateY(var(--hover-lift))`, `--shadow-md`, border `--border-strong`, over `--dur-fast`.
- `:has(:focus-visible)` on the stretched link: ring drawn on the card via `outline` on the card element.
- Press: `scale(var(--scale-press))` over `--dur-instant`.

### 2.6 CourseCard

The most important component. It's denser than the old card: about 40% shorter, and it keeps every fact the old card showed.

```
┌────────────────────────────────────────────────────────┐
│ CSC 2720 · 003                         [📅]  [👁 Watch] │  eyebrow (code·section) + actions
│ Data Structures                                        │  title (link → opens detail)
│ CRN 81234 · 3 credits · In person                      │  meta
│                                                        │
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░  12 open · 28/40            │  enrollment meter + label
│ Waitlist 0 of 10                                       │  only if the section has a waitlist
│                                                        │
│ M T W R F   10:00 – 11:15 AM   Langdale 405            │  meeting rows (max 2, then "+1 more")
│ ──────────────────────────────────────────────────────  │
│ Dr. Jane Smith                    [GPA 3.12] [RMP 4.1] │  instructor + badges
└────────────────────────────────────────────────────────┘
```

**Content and type:**
- Eyebrow: `{subject} {courseNumber} · {sequenceNumber}`, text-xs/600/`--tracking-caps`/`--text-muted`, uppercase.
- Title: `courseTitle` (entity-decoded), text-md/600/`--text`, max 2 lines with clamp. It is an `<a href="?course={crn}">` and the stretched link (§2.5). The old title "Computer Science (CSC 2720)" repeated the eyebrow and is dropped.
- Meta: text-sm `--text-muted`, items joined by `·`: `CRN {crn}` (tabular), credits, instructional method if present, and the term name in tracked view.
- Meeting row: 5 day letters (M T W R F, plus S/U only if any meeting uses them). Each is 20×20, radius-full, text-xs/600. Active = `--accent-subtle` / `--accent-subtle-text`, inactive = `--text-subtle` with no fill. Then the time range in text-sm/600 tabular and the location in text-sm `--text-muted`. "TBA"/online meetings show "Online · asynchronous" in place of days/time.
- Instructor: text-sm/600 `--text`, truncated with ellipsis. Multiple instructors show "Smith +1", with a title attribute listing all of them.
- Badges (right-aligned):
  - GPA badge (§2.10). Tone comes from `gpaTone`: high/good → success, mid → warning, low → danger. Text is "GPA 3.12".
  - RMP chip: `--rmp-bg`, RMP logo at 16 px tall, score text-sm/700 `--rmp-text`, height 24, radius-full.
  - Badges are omitted when there is no data. No "N/A" badges.
  - Both badges come pre-fetched from the server with the results (pages.md, Results), so there are no per-card requests.

**Enrollment meter** (a sub-component, `EnrollmentMeter`):
- Track: 6 px tall, radius-full, `--meter-track`, full width minus the label.
- Fill: `transform: scaleX(enrolled / capacity)` from the left, clamped to [0, 1]. Color by status, using the existing thresholds: `available === 0` → `--meter-full`; `available ≤ 20% of capacity` → `--meter-low`; else `--meter-open`; unknown → no fill, and the label reads "Seats unknown".
- Label (text-sm, tabular): status word in the tone color + counts in `--text-muted`. Examples: **12 open** · 28/40; **3 open** · 37/40; **Full** · 40/40. The word carries the meaning, so color is never the only signal.
- The meter element is `aria-hidden`. The label text is the accessible content.
- Waitlist line (text-xs `--text-muted`) only when `waitCapacity > 0`: "Waitlist 4 of 10". Use `--danger` when the waitlist is full.

**Actions (top right):**
- Schedule toggle: Button `sm` `secondary`, toggle form with `aria-pressed`. Unpressed: `calendarPlus` + "Add". Pressed: `check` + "Added", with pressed styling (accent-subtle). The accessible name is the visible word plus sr-only context ("Add CSC 2720 · 003 to schedule" / "Added CSC 2720 · 003 to schedule"), so it always contains the visible text. Under 360 px of card width it becomes an IconButton with the same name.
- Watch toggle: Button `sm` `secondary`, with `aria-pressed`. Unpressed: `eye` + "Watch". Pressed: `check` + "Watching", with pressed styling as in §2.2 (accent-subtle). The accessible name is the visible word plus sr-only context ("Watching CSC 2720 · 003"). The label doesn't change on hover.
- Tracked view replaces Watch with Button `sm` `danger-ghost` "Remove", which goes through an undo toast instead of a confirm dialog.
- **Guests:** both controls stay enabled. Clicking opens a small `popover` anchored to the control: "Sign in to watch classes" + primary `sm` "Sign in with Google". Disabled-with-title-tooltip (old behaviour) is not used: it's invisible to keyboard and touch users.
- **View-only term:** the schedule toggle is hidden, and Watch is hidden unless already watching (then it shows as pressed and can be removed). The page shows a single inline Banner explaining why (pages.md, Results).

**Notices** (above the meter, text-xs, icon 14):
- Partial data: warning Badge "Limited enrollment data".
- Tracking expires soon (tracked view): `--text-muted` with `clock` icon, "Tracking ends Jan 12".
- Schedule conflict (results view, client-computed against the current term's schedule): danger Badge "Conflicts with MATH 2211". Shown only when the section isn't already scheduled.

**States:** default · hover/press (§2.5) · focus-visible (ring on the card) · watching · scheduled · guest · view-only · expiring · conflict · `selected` (is the source of an open detail view; carries `view-transition-name`, see motion.md §4.4) · skeleton (same box sizes: eyebrow 30%, title 70%, meta 50%, meter full, two meeting rows, instructor 40%).

**Responsive:** the card is a container (`container-type: inline-size`). Under 360 px container width, meta drops credits/method onto a second line, the watch button becomes an IconButton (label in `aria-label`), and badges move under the instructor name.

**Tokens:** `--surface`, `--border`, `--border-strong`, `--radius-lg`, `--shadow-xs/md`, `--text`, `--text-muted`, `--text-subtle`, `--accent-subtle*`, `--meter-*`, `--success/--warning/--danger`, `--rmp-*`, `--space-2..5`.

### 2.7 Modal and Sheet

One `Dialog` component built on `<dialog>` + `showModal()`. That gives the top layer, inert background, `Esc` and focus return for free. It renders as a centered **modal** at ≥640 and as a **bottom sheet** below 640.

**Modal (≥640):** width `min(var(--w), 100vw - 48px)` where `--w` is `sm` 440 (confirmations), `md` 640 (Add classes, Email composer, What's new) or `lg` 960 (course detail). Max-height `min(860px, 100dvh - 48px)`. Radius `--radius-xl`, bg `--surface-elevated`, `--shadow-xl`, 1 px `--border` (barely visible in light, separates the panel from the backdrop in dark; no theme branching). Header (sticky, 64 tall, padding-x 24, bottom rule `--border`): title (text-lg/600) + optional subtitle + actions + close IconButton (`ghost`, `x`, `aria-label="Close"`). Body scrolls (`overflow: auto; overscroll-behavior: contain`), padding 24. Optional footer (sticky, top rule): actions right-aligned, primary last.

**Sheet (<640):** pinned to the bottom, full width, max-height 92dvh, top corners `--radius-xl`, padding-bottom `env(safe-area-inset-bottom)`. A drag handle (36×4, radius-full, `--border-strong`, centered, 8 px from the top) sits above the header. Dragging the handle or header down more than 80 px, or flinging at more than 0.5 px/ms, dismisses. Implement with pointer events on the handle/header only (about 60 lines, no library); the body scroll is never hijacked. While dragging, translate the sheet with the pointer. On release under the threshold, snap back over `--dur` `--ease-out`.

**Backdrop:** `dialog::backdrop { background: var(--overlay) }`. Clicking the backdrop closes, but only when both `pointerdown` and `pointerup` land on the dialog element outside its content box, so a text-selection drag that ends outside doesn't close it.

**Focus:** on open, focus the first element marked `autofocus`. If there is none, focus the dialog heading (`tabindex="-1"`) for content-heavy dialogs (course detail, What's new), or the first field for forms. On close, focus returns to the invoker (native). Confirmation dialogs focus the *least destructive* button.

**URL state:** the course detail dialog is addressable: `?course={crn}&tab={tab}`. Opening it uses `history.pushState` (Next.js App Router integrates native pushState without refetching the RSC payload). Closing calls `history.back()` when the entry was pushed by us, else `replaceState`. The browser Back button closes the dialog, which matters most on mobile sheets. Deep links open it on load.

**Stacking:** a confirmation dialog may open on top of another dialog (top layer stacks). Nothing else nests.

**Tokens:** `--surface-elevated`, `--overlay`, `--shadow-xl`, `--radius-xl`, `--border`, `--border-strong`, `--space-6`.

### 2.8 Tabs

**In-page tabs** (course detail: Overview / Grades / Ratings / Syllabus; Add classes: Search / Tracked): WAI-ARIA tabs.
- Tablist: horizontal, bottom rule 1 px `--border`. It scrolls horizontally with an edge fade (`mask-image`) when it overflows. No wrapping.
- Tab: height 40, padding-x 12, text-sm/600, `--text-muted`; hover `--text`; selected `--text`. An optional leading icon 16 is shown only at ≥640.
- Indicator: one absolutely positioned 2 px bar, `--indicator`, radius-full, under the selected tab. It moves between tabs (motion.md §4.5).
- Keyboard: `←`/`→` move and activate (automatic activation; panels are cheap), wrapping. `Home`/`End`. `Tab` moves into the panel. Roving `tabindex`.
- Panels: `role="tabpanel"`, `tabindex="0"`, `aria-labelledby`. Inactive panels are unmounted. The Syllabus panel mounts its iframe only when selected.

The course detail moves from the old left sidebar nav (208 px of a 1040 px modal) to top tabs, which gives the content back its width.

**Route tabs** (Admin sections) are a `TabNav`: the same visuals, but plain links in a `<nav aria-label>` with `aria-current="page"`. No tab roles, because they navigate.

### 2.9 SegmentedControl

Two to four mutually exclusive options that switch a view: Week/Agenda, the theme picker (System/Light/Dark). Uses `role="radiogroup"` with radio buttons. Track: bg `--surface-2`, radius `--radius-md`, padding 2, height 36. Option: radius `--radius-sm`, text-sm/500, `--text-muted`. Selected: bg `--surface`, `--shadow-xs`, `--text`, 600. Keyboard: arrows move and select (native radio behavior).

### 2.10 Badge and Chip

**Badge** (non-interactive status label): height 22, padding-x 8, radius-full, text-xs/600, tabular numerals, optional 12 px leading icon.

| Tone | bg | text | border |
|---|---|---|---|
| neutral | `--surface-2` | `--text-muted` | `--border` |
| accent | `--accent-subtle` | `--accent-subtle-text` | `--accent-subtle-border` |
| success | `--success-subtle` | `--success` | `--success-border` |
| warning | `--warning-subtle` | `--warning` | `--warning-border` |
| danger | `--danger-subtle` | `--danger` | `--danger-border` |

Used for: GPA, "Limited data", conflict, nav counts ("3"), admin role, announcement type, CRN in the detail header (accent).

**Chip** (interactive): height 32, padding-x 12, radius-full, 1 px `--border`, bg `--surface`, text-sm/500 `--text`.
- Toggle chip (filters): `aria-pressed`. Pressed = bg `--accent-subtle`, border `--indicator`, text `--accent-subtle-text`, leading `check` 16.
- Removable chip (selected subjects): label + trailing IconButton (16 icon, 24 hit, `aria-label="Remove {code}"`).
- Hover: bg `--surface-2`. Focus: ring.

### 2.11 Toast

**Anatomy:** tone icon (20) · title (text-sm/600) · optional body (text-sm `--text-muted`) · optional action (Button `sm` `ghost`, e.g. "Undo") · close IconButton (`sm`).

**Box:** width `min(400px, 100vw - 32px)`, bg `--surface-elevated`, 1 px `--border`, `--shadow-lg`, radius `--radius-md`, padding 12 16. Tone shows only in the icon color (`--success`, `--warning`, `--danger`, `--accent-text` for info). No colored backgrounds.

**Region:** one `<section aria-label="Notifications" popover="manual">` mounted in the root layout. It holds the stack, newest at the bottom, max 3 visible (older ones collapse out). Position: bottom-right 24 px at ≥640; bottom-center at <640, at `bottom: calc(var(--bottomnav-h) + env(safe-area-inset-bottom) + 12px)` when the bottom nav is present. The region is a top-layer popover so it appears above open dialogs: every time a toast is added, call `hidePopover(); showPopover()` to move it to the top of the top layer. While a modal dialog is open the stack stays off the dialog's bottom actions: top-center at <640 (sheets), and lifted by a footer's height (72 px) at ≥640.

**Behavior:** auto-dismiss after 5 s (success/info) or 8 s (warning/error), paused while hovered or while focus is inside. Toasts with an action stay for 8 s. Success/info/warning use `role="status"`; errors use `role="alert"`. Never steal focus.

**Uses:** watch/unwatch (with Undo on unwatch and on tracked-class removal), schedule add/remove (Undo), schedule add that overlaps (warning tone, names the conflicting class), copy actions, save errors, admin actions. Replaces every `alert()` and the bespoke conflict toast.

### 2.12 Skeleton

Primitive `<Skeleton w h radius>`: bg `--skeleton`, radius default `--radius-xs`, with the shimmer from motion.md §4.7. Text-line skeletons are 12 px tall with 8 px gaps. Composite skeletons (`CourseCardSkeleton`, `StatSkeleton`, `CalendarSkeleton`) reproduce the real component's box sizes exactly, so there is zero layout shift on swap.

The container gets `aria-busy="true"` plus one `.sr-only` "Loading {thing}…". Skeletons are hidden for the first 150 ms (motion.md §4.7), so fast responses never flash them.

Skeletons are used only for client-fetched or streamed regions: Suspense fallbacks, schedule-builder course hydration, add-classes search, admin user search. Never as a fake delay.

### 2.13 EmptyState

Centered column, max-width 420, padding `--space-12` `--space-6`. Contents: icon in a 56 px circle (bg `--accent-subtle`, icon 24 `--accent-subtle-text`) → title (text-lg/600) → body (text-sm `--text-muted`, ≤ 2 sentences) → actions (≤ 2 buttons, primary first).

Variants:
- `first-use`: no data yet, e.g. "No tracked classes yet" + "Search classes".
- `no-results`: the filter excludes everything, e.g. "No sections match" + "Clear filters".
- `error`: icon circle `--danger-subtle` / `--danger`, a human message ("Couldn't load your tracked classes."), a "Try again" button that calls the route's `reset()` or refetch, and a `details` disclosure with the error code when available. Error objects are never rendered as text. This is the fix for the old TrackedClasses crash.

Error boundaries (`error.tsx`) render this component.

### 2.14 Banner

One component, two placements.

- **Announcement banner** (global, from admin announcements): full-width, in normal document flow above the app shell, so it scrolls away (§3.1). Min-height 44, padding 10 `--gutter`, text-sm. Tone by type: `info` → `--accent-subtle` / `--accent-subtle-text` / bottom border `--accent-subtle-border`; `warning` → warning subtle set; `error` → danger subtle set. Layout: icon 20 · message (max 2 lines at <640, then a "More" toggle expands) · pager (when > 1: "2 / 3" text-xs tabular + prev/next IconButtons `sm`) · dismiss IconButton (`aria-label="Dismiss announcement"`). The region is `role="region" aria-label="Announcements"`, not a live region. Rotation behavior: motion.md §4.13. Dismissed IDs are kept in localStorage `pantherwatch.dismissedAnnouncements`, capped at the 20 most recent (the old list was unbounded).
- **Inline banner** (page notices: guest mode, view-only term, partial outage): same tones, radius `--radius-md`, 1 px tone border, padding 12 16, optional action Button `sm` at the end. Lives in the page header area.

### 2.15 App navigation: Sidebar, Rail, Top bar, Bottom nav

Navigation items, in order:
1. Dashboard (`dashboard`)
2. Search (`search`)
3. Tracked (`bookmark`, count Badge)
4. Schedule (`calendar`). It was missing from the old sidebar.
5. Divider, then Settings (`settings`)
6. Admin (`admin`), admins only

The Privacy and Terms links live in the sidebar footer (text-xs) and the "More" sheet.

**Sidebar (≥1200).** Width `--sidebar-w` 248, bg `--surface`, right border `--border`, `position: sticky; top: 0; height: 100dvh`, its own scroll.
- Top: brand row, 64 tall, padding-x 20. Panther 32 + "PantherWatch" text-md/700 `--tracking-tight`. Links to `/dashboard`.
- Nav: padding 12. Items are 40 tall, radius `--radius-md`, padding-x 12, gap 12, icon 20, text-sm/500 `--text-muted`. Hover: bg `--surface-2`, text `--text`. Active (`aria-current="page"`): bg `--accent-subtle`, text `--accent-subtle-text`, 600, plus a 3×20 `--indicator` bar at the left edge of the sidebar (outside the item, radius-full on the right). Count Badges right-aligned.
- Footer: user button (Avatar 32 + name text-sm/600 + email text-xs `--text-muted`, truncated). It opens a Menu (§2.21) with Theme (SegmentedControl), Settings and Sign out. Guests get a full-width primary `md` "Sign in with Google" instead. Under it, the Privacy · Terms links (text-xs `--text-subtle`).

**Rail (900–1199).** Width `--rail-w` 72, same surface/border/sticky behavior. Brand row shows the panther 32 only. Items are 48×48, centered, icon 24, with the label in a Tooltip placed to the right. Active state is the same, with the indicator bar at the left edge. Footer: Avatar button (opens the same Menu) and an `expand` IconButton that opens the **drawer**: the full Sidebar content as an overlay panel, 248 wide, `--z-drawer`, `--shadow-xl`, scrim `--overlay`, closed by `Esc`, scrim click, or navigation. The drawer is a `<dialog>` (non-modal positioning, `showModal` for inertness) so focus handling is native.

**Top bar (<900).** Height `--topbar-h` 56, sticky top 0, `--z-header`, bg `--surface`, bottom border `--border`, padding-x `--gutter`. Left: panther 28 + current page title (text-md/600, truncated). Right: Avatar button (opens the Menu) or "Sign in" Button `sm` `primary` for guests. No hamburger.

**Bottom nav (<900).** Fixed bottom, height `--bottomnav-h` 64 + `env(safe-area-inset-bottom)`, `--z-nav`, bg `--surface`, top border `--border`. Five equal items: Dashboard, Search, Tracked, Schedule, More. Each item: icon 24 over a label in text-xs/500, `--text-muted`. Active: icon sits in a 56×28 radius-full pill bg `--accent-subtle`, and icon + label `--accent-subtle-text` 600. "More" opens a Sheet with Settings, Admin (if admin), the theme SegmentedControl, Privacy, Terms and Sign out. For guests, Tracked and Schedule show a 12 px lock glyph. They still navigate: those routes render an in-shell sign-in EmptyState for guests (pages.md §0). The sidebar and rail behave the same way.

**Skip link:** the first focusable element in `<body>`, "Skip to content", targeting `<main id="main" tabindex="-1">`. Visually hidden until focused, then pinned top-left at `--z-skip-link`.

### 2.16 Page header

See §3.3.

### 2.17 Calendar block

Absolutely positioned inside a day column of the week grid.

- **Geometry:** `top = (start − gridStart) / 60 × var(--hour-h)`, `height = duration / 60 × var(--hour-h) − 2px`. `--hour-h` is 48 px at ≥900 and 44 px below. The grid spans from the floor of the earliest start hour to the ceiling of the latest end hour, and always covers at least 8:00–18:00. Overlapping blocks in a day split the column into equal lanes (keep the existing `layoutDayBlocks` algorithm), with a 2 px gutter.
- **Box:** radius `--radius-sm`, padding 4 6, bg = the course's schedule color, text `--sched-text`, `--shadow-xs`. The whole block is a `<button>` that opens the course detail dialog.
- **Content:** line 1 `CSC 2720` text-xs/700. Line 2 time `10:00–11:15` text-xs/500 at 90% opacity (white on any palette color stays above 4.5:1; the minimum is green, 5.02:1 at full white). Line 3 location text-xs at 85% opacity, shown only when block height ≥ 56 px. Everything is single-line with ellipsis. In split lanes (2+ lanes) the block shows the course code only, wrapping between subject and number rather than truncating mid-word; section, time and location stay in the accessible name (sr-only) and a `title` tooltip, and the conflict glyph moves to the bottom-right corner. The accessible name is the full sentence "CSC 2720 section 003, Monday 10:00 to 11:15 AM, Langdale 405".
- **States:** hover (fine pointer): `filter: brightness(1.08)`, `--shadow-md`, `z-index: var(--z-raised)`. Focus: ring (the outline sits outside the block). Pressed: `scale(var(--scale-press))`.
- **Conflict:** both blocks get `outline: 2px solid var(--danger); outline-offset: 1px` plus a 16 px `alert` glyph in the top-right corner (white glyph on a `--danger-fill` circle). The accessible name gets ", conflicts with MATH 2211". The page shows the conflict summary banner (pages.md, Schedule builder).
- **Fresh** (just added): one highlight pulse, motion.md §4.11.

**Schedule palette** (white text; ids are unchanged; stored hex values migrate on read):

| id | Old hex (ratio vs white) | New token | New hex | Ratio |
|---|---|---|---|---|
| blue | `#2563EB` (5.17) | `--sched-blue` | `#1D4ED8` | 6.70 |
| teal | `#0D9488` (3.74 ✗) | `--sched-teal` | `#0F766E` | 5.47 |
| violet | `#7C3AED` (5.70) | `--sched-violet` | `#6D28D9` | 7.10 |
| pink | `#DB2777` (4.60) | `--sched-pink` | `#BE185D` | 6.04 |
| orange | `#EA580C` (3.56 ✗) | `--sched-orange` | `#C2410C` | 5.18 |
| green | `#16A34A` (3.30 ✗) | `--sched-green` | `#15803D` | 5.02 |
| cyan | `#0891B2` (3.68 ✗) | `--sched-cyan` | `#0E7490` | 5.36 |
| slate | `#475569` (7.58) | `--sched-slate` | `#475569` | 7.58 |

`lib/scheduleColors.ts` keeps `{ id, token, value, label, icsName }`. `normalizeScheduleColor(hex)` maps any old hex to the new value by id. It runs on schedule load (DB and local), and the normalized value is written back on the next save. Blocks render with `background: var(--sched-<id>)`, not the hex, so a future palette change is CSS-only. `.ics` export keeps `icsName`.

### 2.18 Avatar

Sizes 24 / 32 / 40 / 64. Radius-full. `<img src={googlePictureUrl} referrerPolicy="no-referrer" alt="">` (decorative when the name is adjacent, which is everywhere), 1 px inner ring `--border` via `box-shadow: inset 0 0 0 1px`. Fallback (no URL, or `onError`): initials (1–2 letters) on `--accent-subtle`, text `--accent-subtle-text`, 600, font-size 40% of the avatar size. The old `CachedAvatar` fetch-to-localStorage is deleted.

### 2.19 Stat

The dashboard and admin number tile. Card (§2.5) with padding `--space-5`. Label text-xs/600/caps/`--text-muted` → value text-xl/700 tabular `--text` (text-2xl at ≥900) → optional helper text-sm `--text-muted`. Optional icon 20 top-right in `--text-subtle`. Count-up behavior: motion.md §4.14. Skeleton: label 40%, value 50% × 32 px.

### 2.20 Tooltip

For icon-only controls and the rail labels only. Never the only carrier of essential information.

- Box: bg `--text`, text `--text-inverse` (16:1 in both themes), text-xs/500, padding 4 8, radius `--radius-sm`, max-width 240, 6 px from the trigger, no arrow.
- Placement: top by default; flip to bottom when there is less than 40 px above; right for the rail. Positioned with `getBoundingClientRect` once on show (no positioning library), in a `popover="manual"` element so it escapes overflow clipping.
- Show: after 400 ms of hover, or immediately on keyboard focus. Hide on pointer leave, blur, `Esc`, or scroll. Not shown for `(pointer: coarse)`.
- `role="tooltip"`, referenced by the trigger's `aria-describedby` only when the text differs from the `aria-label` (otherwise it would be read twice).

### 2.21 Menu

The user menu and the overflow menus in admin tables. A `popover="auto"` element (light-dismiss, top layer) positioned below-end of its trigger (flipping above near the bottom edge). Box: `--surface-elevated`, 1 px `--border`, `--shadow-md`, radius `--radius-md`, padding 4, min-width 200. Items: 36 tall, radius `--radius-sm`, padding-x 12, icon 16 + text-sm. Hover/focus bg `--surface-2`. Destructive items use `--danger`. Keyboard: `role="menu"`/`menuitem`, `↓`/`↑` (wrapping), `Home`/`End`, `Esc` closes and returns focus to the trigger, type-ahead by first letter.

### 2.22 GradeBar

A stacked horizontal bar of A/B/C/D/F shares. Height 8 on cards and 12 in the detail view, radius-full, 1 px `--surface` gaps between segments (`gap` on a flex container with bg `--surface`). Fills `--grade-a`…`--grade-f`. Always paired with a legend: letter + percentage, text-xs `--text-muted`, 8 px squares. Gets `role="img"` with `aria-label` "Grades: A 34%, B 28%, C 20%, D 8%, F 10%".

---

## 3. Layout

### 3.1 App shell

```
<body>
  [Skip to content]
  <AnnouncementBanner/>                 ← normal flow, full width, scrolls away
  <div class="shell">                   ← grid
    <Sidebar/> | <Rail/>                ← ≥900, sticky top:0, height:100dvh
    <div class="column">
      <TopBar/>                         ← <900 only, sticky top:0
      <main id="main" tabindex="-1">
        <PageHeader/>
        {page}
      </main>
    </div>
  </div>
  <BottomNav/>                          ← <900 only, fixed bottom
  <ToastRegion/>                        ← popover, top layer
</body>
```

- `.shell` grid columns: base `1fr`; ≥900 `var(--rail-w) 1fr`; ≥1200 `var(--sidebar-w) 1fr`. The sidebar is a column, not a fixed overlay, so content never needs a `margin-left` hack and nothing animates width on route changes.
- The shell lives in `app/(app)/layout.tsx` (a server component) and persists across navigations. It is not re-mounted per route, which fixes audit §1 (refetching terms, admin check and announcements on every navigation).
- `main` gets padding `var(--space-8) var(--gutter) var(--space-16)` at ≥900 and `var(--space-5) var(--gutter) calc(var(--bottomnav-h) + env(safe-area-inset-bottom) + var(--space-8))` below.
- Sticky offsets are plain `top: 0`. Because the announcement banner scrolls with the page and sits above the shell, nothing needs a JS-measured offset.

### 3.2 Content widths

| Width | Token | Pages |
|---|---|---|
| Narrow, 720 | `--content-narrow` | Settings, Privacy, Terms, Course search form |
| Default, 1200 | `--content-max` | Dashboard, Results, Tracked, Admin |
| Wide, 1440 | `--content-wide` | Schedule builder (calendar needs width) |

The page wrapper is `width: 100%; max-width: <token>; margin-inline: auto`. Landing uses its own 1200 container.

**Course grid:** one column at base; two columns (`repeat(2, minmax(0, 1fr))`) at ≥900 in the default width. There is no three-column layout: cards hold too much tabular data for 360 px. Gap `--space-4` / `--space-6`.

### 3.3 Page header

```
┌──────────────────────────────────────────────────────────────┐
│ Tracked classes                              [Secondary] [Primary]│
│ 6 classes · we email you when a seat opens                    │
│ [optional inline Banner]                                      │
│ [optional sub-row: TabNav or filter bar]                      │
└──────────────────────────────────────────────────────────────┘
```

- `h1`: text-xl (<900) / text-2xl (≥900), 600, `--tracking-tight`, `--text`. Exactly one `h1` per page.
- Description: text-base `--text-muted`, max 60ch, 4 px below the title. Optional.
- Actions: at most two Buttons (`md`), primary rightmost. At <640 they wrap below the description; the primary goes full width only if it's the page's main action.
- Gap from header to content `--space-6`.
- No back buttons (the old schedule builder had one). Navigation is always available in the sidebar or bottom nav.
- On <900 the top bar shows the page title too. The `h1` stays in the page (the top bar's title is `aria-hidden` to avoid duplication).
- **Sticky sub-row** (Results only): the filter bar becomes `position: sticky; top: 0` (≥900) or `top: var(--topbar-h)` (<900), bg `--bg`, `--z-sticky`. It gains `--shadow-sm` and a bottom `--border` once stuck: detect this with a 1 px IntersectionObserver sentinel and toggle `data-stuck`.

---

## 4. Accessibility

Target: WCAG 2.2 AA.

### 4.1 Focus

- The global `:focus-visible` outline (2 px `--focus-ring`, 2 px offset) is the only focus style. It is never suppressed. Components with `overflow: hidden` that clip the outline use `outline-offset: -2px` instead (calendar grid cells, tab lists).
- Focus ring contrast against every surface: light 5.62–6.03:1, dark 6.58–8.50:1 (table below).
- Focus order follows visual order. No positive `tabindex`.
- After an optimistic action removes an element (Remove tracked class, remove schedule block), focus moves to the next item in the list, or to the list heading if it was the last one.
- `forced-colors: active`: outlines survive automatically. The meter gets `border: 1px solid CanvasText` and the fill `background: Highlight`; calendar blocks get `border: 1px solid CanvasText`.

### 4.2 Contrast (computed from tokens.css, WCAG 2.x relative luminance)

Text pairs need ≥ 4.5:1. Non-text UI and graphics need ≥ 3:1. The ratios below come from a script over the resolved token values.

| Pair | Light hex | Light | Dark hex | Dark |
|---|---|---|---|---|
| `--text` on `--bg` | #172036 / #f5f7fb | 15.10 | #ecf0f6 / #0b1222 | 16.34 |
| `--text` on `--surface` | #172036 / #ffffff | 16.20 | #ecf0f6 / #121b2f | 15.01 |
| `--text` on `--surface-2` | #172036 / #ecf0f6 | 14.16 | #ecf0f6 / #1a2439 | 13.55 |
| `--text` on `--surface-elevated` | #172036 / #ffffff | 16.20 | #ecf0f6 / #1e2942 | 12.65 |
| `--text-muted` on `--bg` | #4f5b72 / #f5f7fb | 6.37 | #98a4b8 / #0b1222 | 7.42 |
| `--text-muted` on `--surface` | #4f5b72 / #ffffff | 6.84 | #98a4b8 / #121b2f | 6.81 |
| `--text-muted` on `--surface-2` | #4f5b72 / #ecf0f6 | 5.98 | #98a4b8 / #1a2439 | 6.15 |
| `--text-muted` on `--surface-elevated` | #4f5b72 / #ffffff | 6.84 | #98a4b8 / #1e2942 | 5.75 |
| `--text-subtle` on `--bg` | #5e6a82 / #f5f7fb | 5.07 | #8a96ab / #0b1222 | 6.26 |
| `--text-subtle` on `--surface` | #5e6a82 / #ffffff | 5.44 | #8a96ab / #121b2f | 5.75 |
| `--text-subtle` on `--surface-2` | #5e6a82 / #ecf0f6 | 4.76 | #8a96ab / #1a2439 | 5.19 |
| `--text-subtle` on `--surface-elevated` | #5e6a82 / #ffffff | 5.44 | #8a96ab / #1e2942 | 4.85 |
| `--accent-contrast` on `--accent` | #ffffff / #0039a6 | 9.83 | #ffffff / #1f5fc3 | 6.03 |
| `--accent-contrast` on `--accent-hover` | #ffffff / #002f8a | 11.84 | #ffffff / #2a68cc | 5.32 |
| `--accent-contrast` on `--accent-active` | #ffffff / #062670 | 13.83 | #ffffff / #0039a6 | 9.83 |
| `--accent-text` on `--bg` | #0039a6 / #f5f7fb | 9.17 | #8ab0f0 / #0b1222 | 8.50 |
| `--accent-text` on `--surface` | #0039a6 / #ffffff | 9.83 | #8ab0f0 / #121b2f | 7.80 |
| `--accent-text` on `--surface-2` | #0039a6 / #ecf0f6 | 8.60 | #8ab0f0 / #1a2439 | 7.05 |
| `--accent-text` on `--surface-elevated` | #0039a6 / #ffffff | 9.83 | #8ab0f0 / #1e2942 | 6.58 |
| `--accent-subtle-text` on `--accent-subtle` | #0039a6 / #eef3fc | 8.83 | #a9c4f5 / #16264a | 8.44 |
| `--accent-subtle-text` on `--accent-subtle-hover` | #0039a6 / #dce6f9 | 7.83 | #a9c4f5 / #1c2f59 | 7.44 |
| `--text` on `--accent-subtle` | #172036 / #eef3fc | 14.55 | #ecf0f6 / #16264a | 13.02 |
| `--success` on `--surface` | #13703a / #ffffff | 6.16 | #5cc98a / #121b2f | 8.32 |
| `--success` on `--surface-2` | #13703a / #ecf0f6 | 5.39 | #5cc98a / #1a2439 | 7.51 |
| `--success` on `--success-subtle` | #13703a / #ecf8f1 | 5.66 | #5cc98a / #0f2a1d | 7.43 |
| `--warning` on `--surface` | #96550a / #ffffff | 5.83 | #f2b84b / #121b2f | 9.59 |
| `--warning` on `--surface-2` | #96550a / #ecf0f6 | 5.10 | #f2b84b / #1a2439 | 8.66 |
| `--warning` on `--warning-subtle` | #96550a / #fef6e7 | 5.43 | #f2b84b / #2b1f0a | 9.00 |
| `--danger` on `--surface` | #b42318 / #ffffff | 6.57 | #ff8a7f / #121b2f | 7.51 |
| `--danger` on `--surface-2` | #b42318 / #ecf0f6 | 5.75 | #ff8a7f / #1a2439 | 6.78 |
| `--danger` on `--danger-subtle` | #b42318 / #fef1f0 | 5.97 | #ff8a7f / #3a1512 | 7.09 |
| `--danger-contrast` on `--danger-fill` | #ffffff / #b42318 | 6.57 | #ffffff / #b42318 | 6.57 |
| `--danger-contrast` on `--danger-fill-hover` | #ffffff / #9a1c12 | 8.24 | #ffffff / #c4301f | 5.54 |
| `--text` on `--warning-subtle` | #172036 / #fef6e7 | 15.08 | #ecf0f6 / #2b1f0a | 14.09 |
| `--text` on `--danger-subtle` | #172036 / #fef1f0 | 14.70 | #ecf0f6 / #3a1512 | 14.17 |
| `--text` on `--success-subtle` | #172036 / #ecf8f1 | 14.86 | #ecf0f6 / #0f2a1d | 13.41 |
| `--rmp-text` on `--rmp-bg` | #ffffff / #000000 | 21.00 | same | 21.00 |
| `--text-inverse` on `--text` (tooltip) | #ffffff / #172036 | 16.20 | #0b1222 / #ecf0f6 | 16.34 |
| `--sched-text` on each `--sched-*` | white on 8 colors | 5.02–7.58 | same | 5.02–7.58 |

**Non-text (≥ 3:1 required):**

| Pair | Light | Dark |
|---|---|---|
| `--focus-ring` on `--bg` / `--surface` / `--surface-elevated` | 5.62 / 6.03 / 6.03 | 8.50 / 7.80 / 6.58 |
| `--indicator` on `--surface` / `--surface-2` / `--surface-elevated` | 9.83 / 8.60 / 9.83 | 7.80 / 7.05 / 6.58 |
| `--indicator-contrast` on `--indicator` (check glyph) | 9.83 | 8.50 |
| `--border-strong` (input outline) on `--surface` / `--bg` / `--surface-2` | 3.58 / 3.33 / 3.13 | 4.80 / 5.23 / 4.33 |

**Documented exceptions:**
- `--border` (decorative dividers and card outlines) is 1.2–1.4:1 by design. It never carries meaning alone. Inputs use `--border-strong`.
- `--accent` as a *fill* in dark mode is 2.85:1 against `--surface`. Buttons are identified by their label text (6.03:1 on the fill), which satisfies 1.4.11. Selected-state marks use `--indicator` instead.
- Enrollment-meter fills in light mode are 2.05–3.55:1 against the track. The meter is `aria-hidden` and fully duplicated by the text label ("12 open · 28/40"), so it is a supplementary graphic. Dark-mode fills are 5.28–6.74:1.
- Grade-bar fills (C is 2.19:1 on white) are always paired with a text legend and an `aria-label`, so they are supplementary.

### 4.3 Reduced motion

`prefers-reduced-motion: reduce` is handled in three layers:
1. **Tokens** (tokens.css §3): all movement distances go to 0, scale tokens to 1, stagger to 0, and slow durations clamp to 200 ms. Every enter/exit built on the tokens becomes a short opacity fade with no component code.
2. **Disabled outright:** View Transition morphs (card→modal, calendar reflow, sidebar drawer), the skeleton shimmer, count-up, banner auto-rotation, and the watch pulse ring. The exact per-animation fallback is in the motion.md §4 table.
3. **Never:** autoplaying video, parallax, or infinite decorative animation (in either mode).

There is no global `* { transition-duration: 0.01ms !important }` hammer (the old app had one). It also killed the fades that reduced-motion users can tolerate, and hid state changes.

### 4.4 Keyboard patterns

| Pattern | Keys |
|---|---|
| Dialog / Sheet | Opens with focus inside (§2.7). `Tab`/`Shift+Tab` cycle within (native inert background). `Esc` closes and returns focus to the invoker. Back button closes the course dialog. |
| Tabs | `←` `→` (wrap) move and activate. `Home` `End`. `Tab` enters the panel. |
| Autocomplete | `↓` opens/moves, `↑` moves, `Enter` selects (stays open), `Esc` closes then clears, `Backspace` on empty removes the last chip, `Tab` leaves without selecting. |
| Menu | `Enter`/`Space`/`↓` on the trigger opens with the first item focused, `↑` opens on the last. `↓` `↑` `Home` `End`, type-ahead. `Esc` closes to the trigger. `Tab` closes and moves on. |
| SegmentedControl | Arrow keys (radio group). |
| Toggle buttons | `Space`/`Enter`, state via `aria-pressed`. |
| CourseCard | `Tab` reaches the title link (opens detail), then the schedule toggle, then Watch. `Enter` on the title opens the dialog. |
| Calendar | Blocks are buttons in DOM order (day, then start time). `Enter` opens detail. Week/Agenda via SegmentedControl. |
| Toasts | Not in the tab order unless they have an action. Those actions are reachable via `F6`-style landmark navigation (the region is labelled). Toast timers pause on focus. |

### 4.5 Other requirements

- Landmarks: `header` (top bar), `nav` × 2 with distinct labels ("Primary", "Account"), `main`, `footer` on landing/legal.
- The results count has `aria-live="polite"` and announces "48 sections" after filtering, debounced 500 ms.
- Pages work at 200% text zoom and at 320 px width without horizontal scroll (except the calendar grid, which scrolls inside its own container with a visible scrollbar).
- Language: `lang="en"`. Time format: "10:00 – 11:15 AM" with an en dash and thin spaces, read correctly by screen readers.
- No information is conveyed by color alone: seat status has words, grades have letters, conflicts have an icon and text, and toast tone has an icon.

---

## 5. Guardrails (CI checks the implementer adds)

Simple scripts in `scripts/check-css.mjs`, run in `npm run lint`:

1. **Undefined variables:** parse every `*.css` / `*.module.css` with PostCSS and collect `var(--x)` references. Each one must be defined in `tokens.css`, be locally defined in the same rule (component-private `--_x` variables, which must start with `--_`), or be on the allowlist (`--font-inter`).
2. **No color literals** outside `tokens.css`: reject `#[0-9a-f]{3,8}\b`, `rgb(`, `rgba(`, `hsl(` and named colors other than `transparent` and `currentColor` in `color`/`background*`/`border*`/`outline*`/`fill`/`stroke`/`box-shadow` declarations. `color-mix(` is allowed only in `Home.module.css`.
3. **Media queries:** only `(min-width: 640px|900px|1200px)`, `(hover: hover) and (pointer: fine)`, `(pointer: coarse)`, `(prefers-reduced-motion: reduce)` and `(forced-colors: active)`. No `max-width`. `prefers-color-scheme` and `[data-theme` are only allowed in `tokens.css` and the pre-paint script.
4. **z-index:** values must be `var(--z-*)`.
5. **Durations and easings:** `transition`/`animation` must use `var(--dur*)` and `var(--ease*)` tokens. No raw `ms`/`s` values outside `tokens.css` and `motion.css`.
6. **framer-motion / motion:** `package.json` must not list `framer-motion` or `motion` (motion.md §1).
7. **No `@import url(` of remote fonts.** No BOMs in source files.

`docs/design/tokens.css` currently passes check 1: 210 custom properties, zero unresolved references, verified with PostCSS.
