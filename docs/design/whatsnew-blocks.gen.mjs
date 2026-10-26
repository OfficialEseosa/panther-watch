// Generator for the What's new "Rebuilt from the ground up" cube choreography.
// Run from the repo root after editing the numbers below:
//   node docs/design/whatsnew-blocks.gen.mjs web/src/components/dashboard/WhatsNewShowcase.module.css
// It rewrites only the block between the BLOCKS:GENERATED markers in that file.
// Units: S = cube edge (CSS var --s). x right, y = height of the cube CENTRE above the floor,
// z toward the viewer. Rotations in degrees.
import fs from "node:fs";

const file = process.argv[2];
const T = 3.7; // main choreography length (s); snap happens at T
const G = 2;

// ---- final 3-2-1 pyramid ----
const gap = 0.045; // also keeps touching faces from z-fighting
const FINAL = {
  0: { x: 0, y: 0.5, z: 0 },
  1: { x: -(1 + gap), y: 0.5, z: 0 },
  2: { x: 1 + gap, y: 0.5, z: 0 },
  3: { x: -(0.5 + gap / 2), y: 1.52, z: 0 },
  4: { x: 0.5 + gap / 2, y: 1.52, z: 0 },
  5: { x: 0, y: 2.54, z: 0 },
};

// ---- tower: slightly misaligned ----
const MISALIGN = [0, 0.05, -0.04, 0.07, -0.05, 0.04];
const TWIST = [0, 3, -4, 5, -3, 6]; // rotateY, degrees

// Sway (anticipation): rigid lean about the base, increasing amplitude, ending leaning left.
const SWAY = [
  [0.0, 0],
  [0.22, 1.2],
  [0.46, -2.0],
  [0.7, 3.0],
  [0.95, -4.5],
  [1.2, 6.5],
];

// Tumble: [delay after 1.2 s, landing x, landing z, rotation axis, fall rotation]
const FALL = {
  5: { d: 0.0, x: -1.8, z: 0.9, axis: "z", r: -180 },
  4: { d: 0.1, x: 1.75, z: 0.25, axis: "z", r: 180 },
  3: { d: 0.2, x: -1.15, z: 1.6, axis: "x", r: -180 },
  2: { d: 0.3, x: 1.25, z: -1.1, axis: "z", r: 180 },
  1: { d: 0.4, x: -0.6, z: -1.3, axis: "x", r: 180 },
  0: { d: 0.5, x: 0.15, z: 0.1, axis: "y", r: 0 }, // the base just gets knocked and twists
};
const FALL_DUR = 0.72;

// Settle: hop order and start times (bottom row first). Each hop finishes the rotation to 360.
const HOP = { 1: 2.55, 2: 2.62, 0: 2.66, 3: 2.82, 4: 2.9, 5: 3.08 };
const HOP_DUR = 0.52;

const r2 = (n) => Math.round(n * 1000) / 1000;
const pct = (t) => `${r2((t / T) * 100)}%`;

function towerPose(i, theta) {
  const rad = (theta * Math.PI) / 180;
  const x0 = MISALIGN[i];
  const h = 0.5 + i * 1.02;
  return { x: x0 * Math.cos(rad) + h * Math.sin(rad), y: -x0 * Math.sin(rad) + h * Math.cos(rad), z: 0, rx: 0, ry: TWIST[i], rz: theta, sy: 1 };
}

function frames(i) {
  const out = []; // {t, pose, ease}
  const add = (t, pose, ease = "linear") => out.push({ t: Math.min(T, Math.max(0, t)), pose: { ...pose }, ease });
  // A: sway
  for (const [t, th] of SWAY) add(t, towerPose(i, th), "cubic-bezier(0.45, 0, 0.55, 1)");
  const f = FALL[i];
  const start = 1.2 + f.d;
  const p0 = towerPose(i, SWAY[SWAY.length - 1][1]);
  // hold the lean (keep tilting a touch) until this cube lets go
  if (f.d > 0) add(start, towerPose(i, SWAY[SWAY.length - 1][1] + f.d * 10), "linear");
  const from = f.d > 0 ? towerPose(i, SWAY[SWAY.length - 1][1] + f.d * 10) : p0;
  // B: ballistic fall, sampled
  const vy0 = i === 0 ? 0.6 : 1.4; // small hop as it lets go
  const g = 2 * (from.y - 0.5 + vy0 * FALL_DUR) / (FALL_DUR * FALL_DUR); // land exactly at y=0.5
  const N = 7;
  const rot0 = { x: from.rx, y: from.ry, z: from.rz };
  const rotEnd = { x: 0, y: 0, z: 0 };
  rotEnd[f.axis] = f.r;
  if (f.axis === "y") rotEnd.y = 35; // base twist
  for (let k = 1; k <= N; k++) {
    const u = k / N;
    const t = u * FALL_DUR;
    const y = from.y + vy0 * t - (g * t * t) / 2;
    const e = u; // rotation linear in time (constant angular velocity)
    add(start + t, {
      x: from.x + (f.x - from.x) * u,
      y: Math.max(0.5, y),
      z: from.z + (f.z - from.z) * u,
      rx: rot0.x + (rotEnd.x - rot0.x) * e,
      ry: f.axis === "y" ? rot0.y + (rotEnd.y - rot0.y) * e : rot0.y * (1 - e),
      rz: f.axis === "z" ? rot0.z + (rotEnd.z - rot0.z) * e : rot0.z * (1 - e),
      sy: 1,
    }, "linear");
  }
  const land = start + FALL_DUR;
  const rest = { x: f.x, y: 0.5, z: f.z, rx: rotEnd.x, ry: f.axis === "y" ? rotEnd.y : 0, rz: f.axis === "z" ? rotEnd.z : 0, sy: 1 };
  add(land + 0.07, { ...rest, y: 0.5 - 0.04, sy: 0.92 }, "ease-out");
  add(land + 0.17, { ...rest, y: 0.5 + 0.03, sy: 1.02 }, "ease-in-out");
  add(land + 0.26, rest, "linear");
  // C: hop into place, finishing the turn to a full revolution
  const hs = HOP[i];
  add(hs, rest, "linear");
  const fin = FINAL[i];
  const endRot = { rx: rest.rx === 0 ? 0 : Math.sign(rest.rx) * 360, ry: 0, rz: rest.rz === 0 ? 0 : Math.sign(rest.rz) * 360 };
  // Quadratic Bezier in y: rises, then drops onto the target from above.
  const yc = Math.max(rest.y, fin.y) + 1.1;
  const M = 7;
  for (let k = 1; k <= M; k++) {
    const u = k / M;
    const s = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2; // ease-in-out horizontal
    const y = (1 - u) * (1 - u) * rest.y + 2 * u * (1 - u) * yc + u * u * fin.y;
    add(hs + u * HOP_DUR, {
      x: rest.x + (fin.x - rest.x) * s,
      y,
      z: rest.z + (fin.z - rest.z) * s,
      rx: rest.rx + (endRot.rx - rest.rx) * s,
      ry: rest.ry + (endRot.ry - rest.ry) * s,
      rz: rest.rz + (endRot.rz - rest.rz) * s,
      sy: 1,
    }, "linear");
  }
  const he = hs + HOP_DUR;
  const finalPose = { ...fin, rx: endRot.rx, ry: 0, rz: endRot.rz, sy: 1 };
  add(he + 0.05, { ...finalPose, y: fin.y - 0.03, sy: 0.94 }, "ease-out");
  add(he + 0.12, finalPose, "linear");
  add(T, finalPose, "linear");
  out.sort((a, b) => a.t - b.t);
  // de-dupe identical times
  return out.filter((f, k) => k === 0 || f.t > out[k - 1].t + 1e-6);
}

const len = (n) => (Math.abs(n) < 1e-6 ? "0px" : `calc(var(--s) * ${r2(n)})`);
const tf = (p) =>
  `translate3d(${len(p.x)}, ${len(-p.y)}, ${len(p.z)}) scale3d(1, ${r2(p.sy)}, 1) rotateX(${r2(p.rx)}deg) rotateY(${r2(p.ry)}deg) rotateZ(${r2(p.rz)}deg)`;
const shadowScale = (y) => 1 / (1 + (y - 0.5) / 1.6);
const stf = (p) => `translate(${len(p.x)}, ${len(p.z)}) scale(${r2(shadowScale(p.y) * (p.sy < 1 ? 1.08 : 1))})`;
const sop = (p) => r2(0.55 * Math.pow(shadowScale(p.y), 1.6) * (p.sy < 1 ? 1.15 : 1));

let css = "";
for (let i = 0; i < 6; i++) {
  const fr = frames(i);
  const fin = { ...FINAL[i], rx: 0, ry: 0, rz: 0, sy: 1 };
  css += `.k${i} {\n  transform: ${tf(fin)};\n}\n\n`;
  css += `.sh${i} {\n  transform: ${stf(fin)};\n  opacity: ${sop(fin)};\n}\n\n`;
  css += `@keyframes cube-${i} {\n`;
  for (const f of fr) css += `  ${pct(f.t)} {\n    transform: ${tf(f.pose)};\n    animation-timing-function: ${f.ease};\n  }\n`;
  css += `}\n\n@keyframes shadow-${i} {\n`;
  for (const f of fr) css += `  ${pct(f.t)} {\n    transform: ${stf(f.pose)};\n    opacity: ${sop(f.pose)};\n    animation-timing-function: ${f.ease};\n  }\n`;
  css += `}\n\n`;
}
css += `@media (prefers-reduced-motion: no-preference) {\n`;
for (let i = 0; i < 6; i++) css += `  .k${i} {\n    animation: cube-${i} ${T}s both;\n  }\n\n  .sh${i} {\n    animation: shadow-${i} ${T}s both;\n  }\n\n`;
css = css.trimEnd() + `\n}\n`;

let src = fs.readFileSync(file, "utf8");
const A = "/* BLOCKS:GENERATED:START */";
const B = "/* BLOCKS:GENERATED:END */";
const a = src.indexOf(A);
const b = src.indexOf(B);
if (a < 0 || b < 0) throw new Error("markers missing");
src = src.slice(0, a + A.length) + "\n" + css + src.slice(b);
fs.writeFileSync(file, src);
console.log("ok", css.length);
