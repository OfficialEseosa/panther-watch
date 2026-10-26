import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

/**
 * Link-preview card (Open Graph + Twitter, via twitter-image.tsx): panther mark, wordmark and
 * tagline on flat GSU blue, next to a static replica of the course card
 * (components/dashboard/SampleCourseCard). Satori only does flexbox and inline styles, so the
 * card is rebuilt here with explicit px and the light-theme colors from styles/tokens.css.
 */

export const alt = "PantherWatch: Track seats. Enroll faster. A Georgia State course card with live seats.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/* tokens.css (light theme) */
const C = {
  gsuBlue: "#0039a6", // --color-primary-600
  surface: "#ffffff",
  surfaceMuted: "#f1f4f9",
  border: "#d6deeb",
  text: "#1f2937",
  muted: "#4b5563",
  heading: "#152044",
  accentSubtle: "#e4eef9", // --color-primary-100
  accentSubtleBorder: "#7fa9e6", // --color-primary-300
  success: "#145f36", // --color-success mixed 85% with black, as the card does
  gradeA: "#1d814c",
  gradeB: "#4f9bd9",
  gradeC: "#e0a52b",
  gradeD: "#d97a2b",
  gradeF: "#b42318",
};

/** The panther mark is 901×715 (same source as /brand/panther-*.webp; satori can't read WebP). */
const MARK_HEIGHT = 150;
const MARK_WIDTH = Math.round((MARK_HEIGHT * 901) / 715);

type Weight = 500 | 600 | 700 | 800;
const WEIGHTS: Weight[] = [500, 600, 700, 800];

/**
 * Inter TTF from Google Fonts (the CSS API serves truetype to non-browser agents). Null when
 * offline so the image still renders; ImageResponse then falls back to its bundled font.
 */
async function loadInter(weight: Weight): Promise<ArrayBuffer | null> {
  try {
    const css = await fetch(`https://fonts.googleapis.com/css2?family=Inter:wght@${weight}`).then((r) =>
      r.ok ? r.text() : "",
    );
    const url = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/)?.[1];
    if (!url) return null;
    const res = await fetch(url);
    return res.ok ? await res.arrayBuffer() : null;
  } catch {
    return null;
  }
}

async function dataUrl(publicPath: string, mime: string): Promise<string> {
  const file = await readFile(join(process.cwd(), "public", publicPath));
  return `data:${mime};base64,${file.toString("base64")}`;
}

/** Cached, so the route prerenders at build time under Cache Components instead of per request. */
async function loadAssets() {
  "use cache";
  const [panther, rmp, ...fonts] = await Promise.all([
    dataUrl("brand/panther.png", "image/png"),
    dataUrl("brand/rmp.svg", "image/svg+xml"),
    ...WEIGHTS.map(loadInter),
  ]);
  return { panther, rmp, fonts };
}

/** components/ui/icons (24×24, 1.75 stroke) as data URLs: satori draws <img> SVGs more faithfully. */
function icon(stroke: string, body: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}
const CALENDAR_ICON = icon(C.muted, '<rect x="4" y="5.5" width="16" height="14.5" rx="2"/><path d="M8 3.5v4M16 3.5v4M4 10.5h16"/>');
const EYE_ICON = icon(
  C.heading,
  '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
);

const label = {
  fontSize: 13,
  fontWeight: 500,
  lineHeight: 1.3,
  letterSpacing: "0.07em",
  textTransform: "uppercase" as const,
  color: C.muted,
};

const DAYS = ["M", "T", "W", "T", "F"];
const GRADES: [color: string, pct: number][] = [
  [C.gradeA, 29],
  [C.gradeB, 38],
  [C.gradeC, 20],
  [C.gradeD, 8],
  [C.gradeF, 5],
];

function CourseCard({ rmp }: { rmp: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: 500,
        background: C.surface,
        border: `1px solid ${C.border}`,
        borderRadius: 16, // --radius-lg
        boxShadow: "0 24px 60px rgba(3, 10, 40, 0.35)", // --shadow-xl, deepened for the blue
        color: C.text,
        transform: "rotate(-3deg) scale(1.08)",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          padding: "16px 20px",
          // Rounded here rather than overflow:hidden on the card, which clips <img>s under rotation.
          borderRadius: "15px 15px 0 0",
          background: C.surfaceMuted,
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
          <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.3, color: C.heading }}>
            Computer Science (CSC 4520)
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 6,
              padding: "2px 10px",
              borderRadius: 999,
              background: C.accentSubtle,
              border: `1px solid ${C.accentSubtleBorder}`,
              color: C.gsuBlue,
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            CRN 12345
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 36,
              height: 36,
              border: `1px solid ${C.border}`,
              borderRadius: 6,
              background: C.surface,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- satori renders <img> */}
            <img src={CALENDAR_ICON} alt="" width={18} height={18} />
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              height: 36,
              padding: "0 12px",
              border: `1px solid ${C.border}`,
              borderRadius: 6,
              background: C.surface,
              color: C.heading,
              fontSize: 15,
              fontWeight: 600,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- satori renders <img> */}
            <img src={EYE_ICON} alt="" width={18} height={18} />
            Watch
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "14px 20px 18px" }}>
        <div style={{ display: "flex", gap: 16 }}>
          {[
            ["Course title", "Algorithms"],
            ["Section", "001"],
            ["Credits", "4"],
          ].map(([k, v]) => (
            <div key={k} style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1 }}>
              <div style={label}>{k}</div>
              <div style={{ fontSize: 17, fontWeight: 600, color: C.heading }}>{v}</div>
            </div>
          ))}
        </div>

        <div
          style={{
            display: "flex",
            gap: 14,
            padding: "10px 16px",
            background: C.surfaceMuted,
            border: `1px solid ${C.border}`,
            borderRadius: 10, // --radius-md
          }}
        >
          {[
            ["12", "Available", C.success],
            ["28", "Enrolled", C.heading],
            ["40", "Capacity", C.heading],
          ].map(([v, k, color]) => (
            <div key={k} style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1 }}>
              <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.15, color }}>{v}</div>
              <div style={label}>{k}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ ...label, fontWeight: 600 }}>Instructor</div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: 17, fontWeight: 600, color: C.heading }}>Alina Nemira</div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "4px 11px 4px 8px",
                borderRadius: 999,
                background: "#000000", // --rmp-bg
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- satori renders <img>, not next/image */}
              <img src={rmp} alt="" width={35} height={20} />
              <div style={{ fontSize: 17, fontWeight: 800, lineHeight: 1, color: "#ffffff" }}>4.1</div>
            </div>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
            padding: "10px 14px",
            border: `1px solid ${C.border}`,
            borderRadius: 10,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: C.heading }}>10:00 AM – 10:50 AM</div>
            <div style={{ display: "flex", gap: 5 }}>
              {DAYS.map((d, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 24,
                    height: 24,
                    borderRadius: 999,
                    background: C.accentSubtle,
                    color: C.gsuBlue,
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  {d}
                </div>
              ))}
            </div>
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, color: C.heading }}>Classroom South - Room 404</div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            paddingTop: 12,
            borderTop: `1px solid ${C.border}`,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.05 }}>
            <div style={{ fontSize: 19, fontWeight: 700, color: C.success }}>3.12</div>
            <div style={{ ...label, fontSize: 11, letterSpacing: "0.04em" }}>avg GPA</div>
          </div>
          <div
            style={{
              display: "flex",
              flex: 1,
              height: 10,
              overflow: "hidden",
              borderRadius: 999,
              background: C.border,
            }}
          >
            {GRADES.map(([color, pct]) => (
              <div key={color} style={{ width: `${pct}%`, height: "100%", background: color }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default async function Image() {
  const { panther, rmp, fonts: fontData } = await loadAssets();
  const fonts = WEIGHTS.flatMap((weight, i) => {
    const data = fontData[i];
    return data ? [{ name: "Inter", data, weight, style: "normal" as const }] : [];
  });

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: C.gsuBlue,
          color: "#ffffff",
          fontFamily: fonts.length ? "Inter" : undefined,
        }}
      >
        {/* Left ~45%: brand, then the site line pinned to the bottom. */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            width: 540,
            padding: "60px 0 56px 72px",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", marginTop: 32 }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- satori renders <img>, not next/image */}
            <img src={panther} alt="" width={MARK_WIDTH} height={MARK_HEIGHT} />
            <div style={{ marginTop: 24, fontSize: 64, fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1.05 }}>
              PantherWatch
            </div>
            <div
              style={{ marginTop: 12, fontSize: 34, fontWeight: 500, lineHeight: 1.2, color: "rgba(255, 255, 255, 0.85)" }}
            >
              Track seats. Enroll faster.
            </div>
          </div>
          <div style={{ display: "flex", fontSize: 20, fontWeight: 500, whiteSpace: "nowrap", color: "rgba(255, 255, 255, 0.7)" }}>
            pantherwatch.app · Georgia State course tracker
          </div>
        </div>

        {/* Right ~55%: the course card, tilted. */}
        <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center", paddingRight: 48 }}>
          <CourseCard rmp={rmp} />
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
