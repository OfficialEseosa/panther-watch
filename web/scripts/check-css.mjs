#!/usr/bin/env node
/**
 * Checks the built CSS (`.next/static/chunks/**\/*.css`, from `npm run build`) for references
 * that resolve to nothing at runtime:
 *
 * 1. Every keyframe name used by `animation` / `animation-name` must have a matching
 *    `@keyframes` somewhere in the built output. Turbopack's CSS Modules rename animation
 *    identifiers per module (`rise-in` -> `Gga1VW_rise-in`), so a module that names a shared
 *    keyframe from `src/styles/motion.css` directly ends up pointing at nothing. Names behind
 *    `var(--x)` are resolved through every definition of `--x` in the built CSS.
 * 2. Every `var(--x)` must be defined somewhere: a `--x:` declaration or `@property --x` in the
 *    built CSS, or a custom property the source sets at runtime (a "--x" string literal in
 *    `src/**\/*.{ts,tsx}`, e.g. `style={{ "--i": n }}` or `style.setProperty("--from", ...)`).
 *
 *   npm run build && npm run check:css      # exit 1 and a list of problems on failure
 *   node scripts/check-css.mjs [dir]        # another build dir (default .next)
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const buildDir = path.resolve(root, process.argv[2] ?? ".next");
const chunksDir = path.join(buildDir, "static", "chunks");

function walk(dir, test, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name !== "node_modules") walk(full, test, out);
    } else if (test(name)) out.push(full);
  }
  return out;
}

const cssFiles = walk(chunksDir, (name) => name.endsWith(".css"));
if (cssFiles.length === 0) {
  console.error(`check:css: no CSS under ${path.relative(root, chunksDir)}. Run \`npm run build\` first.`);
  process.exit(1);
}

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const sheets = cssFiles.map((file) => ({ file: path.relative(root, file), css: stripComments(readFileSync(file, "utf8")) }));

// ---- definitions ------------------------------------------------------------------------
const keyframes = new Set();
/** --name -> every value it is assigned anywhere in the built CSS */
const customProps = new Map();
for (const { css } of sheets) {
  for (const m of css.matchAll(/@(?:-webkit-)?keyframes\s+("[^"]+"|'[^']+'|[^\s{]+)/g)) keyframes.add(unquote(m[1]));
  for (const m of css.matchAll(/@property\s+(--[\w-]+)/g)) addProp(m[1], "");
  for (const m of css.matchAll(/(?<![\w-])(--[\w-]+)\s*:([^;}]*)/g)) addProp(m[1], m[2].trim());
}
function addProp(name, value) {
  if (!customProps.has(name)) customProps.set(name, []);
  customProps.get(name).push(value);
}

// Custom properties set at runtime by the source (inline styles, style.setProperty).
const runtimeProps = new Set();
for (const file of walk(path.join(root, "src"), (name) => /\.(tsx?|mts)$/.test(name))) {
  for (const m of readFileSync(file, "utf8").matchAll(/["'`](--[\w-]+)["'`]/g)) runtimeProps.add(m[1]);
}

function unquote(s) {
  return /^["'].*["']$/.test(s) ? s.slice(1, -1) : s;
}

// ---- tokenizing ---------------------------------------------------------------------------
/** Splits on top-level `sep` (comma or whitespace), keeping parenthesized groups intact. */
function splitTop(value, isSep) {
  const parts = [];
  let depth = 0;
  let quote = null;
  let current = "";
  for (const ch of value) {
    if (quote) {
      current += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (depth === 0 && isSep(ch)) {
      if (current.trim()) parts.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

const NOT_A_NAME = new Set([
  "none", "initial", "inherit", "unset", "revert", "revert-layer",
  "ease", "ease-in", "ease-out", "ease-in-out", "linear", "step-start", "step-end",
  "infinite", "normal", "reverse", "alternate", "alternate-reverse",
  "forwards", "backwards", "both", "running", "paused", "auto",
  "replace", "add", "accumulate",
]);

/** The tokens of one value with var() references expanded (each var -> every definition). */
function expand(tokens, seen = new Set()) {
  const out = [];
  for (const token of tokens) {
    const v = /^var\(\s*(--[\w-]+)\s*(?:,(.*))?\)$/s.exec(token);
    if (!v) {
      out.push({ token });
      continue;
    }
    const [, name, fallback] = v;
    const values = customProps.get(name);
    if (values && !seen.has(name)) {
      const next = new Set(seen).add(name);
      for (const value of values) out.push(...expand(splitTop(value, (c) => /\s/.test(c)), next));
    } else if (!values && runtimeProps.has(name)) {
      out.push({ token, runtime: true }); // set inline; can't be resolved statically
    }
    if (fallback !== undefined) out.push(...expand(splitTop(fallback, (c) => /\s/.test(c)), seen));
  }
  return out;
}

function keyframeNames(value) {
  const names = [];
  const clean = value.replace(/!important\s*$/i, "").trim();
  for (const layer of splitTop(clean, (c) => c === ",")) {
    for (const { token } of expand(splitTop(layer, (c) => /\s/.test(c)))) {
      if (/^["']/.test(token)) names.push(unquote(token));
      else if (/^-?[A-Za-z_][\w-]*$/.test(token) && !NOT_A_NAME.has(token.toLowerCase())) names.push(token);
      // anything else: a time, a number, a function (cubic-bezier/steps/linear), a runtime var
    }
  }
  return names;
}

// ---- checks -------------------------------------------------------------------------------
const problems = [];
const where = (css, index) => {
  const start = css.lastIndexOf("}", index) + 1;
  return css.slice(start, css.indexOf("{", start)).trim().slice(0, 120) || "(top level)";
};

let animationDecls = 0;
let varRefs = 0;
for (const { file, css } of sheets) {
  for (const m of css.matchAll(/(?<![\w-])(?:-webkit-)?(animation(?:-name)?)\s*:([^;}]*)/g)) {
    animationDecls++;
    for (const name of keyframeNames(m[2])) {
      if (!keyframes.has(name)) {
        problems.push(`${file}: ${m[1]} references "${name}" with no @keyframes (in \`${where(css, m.index)}\`)`);
      }
    }
  }
  for (const m of css.matchAll(/var\(\s*(--[\w-]+)/g)) {
    varRefs++;
    const name = m[1];
    if (!customProps.has(name) && !runtimeProps.has(name)) {
      problems.push(`${file}: var(${name}) is never defined (in \`${where(css, m.index)}\`)`);
    }
  }
}

const unique = [...new Set(problems)];
if (unique.length > 0) {
  console.error(`check:css: ${unique.length} problem(s) in ${sheets.length} built CSS file(s):\n`);
  for (const problem of unique) console.error(`  - ${problem}`);
  console.error(
    "\nShared keyframes from src/styles/motion.css must be referenced from CSS Modules through their" +
      " --kf-* alias (animation: var(--kf-rise-in) ...). See src/styles/README.md.",
  );
  process.exit(1);
}
console.log(
  `check:css: ok. ${sheets.length} CSS files, ${keyframes.size} @keyframes, ${animationDecls} animation declarations, ` +
    `${varRefs} var() references (${customProps.size} defined in CSS, ${runtimeProps.size} set at runtime).`,
);
