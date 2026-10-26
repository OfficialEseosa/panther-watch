import type { ReactNode, SVGProps } from "react";

/**
 * The original app's line icons (old components/Icon), used by the course cards, results,
 * the detail dialog and tracked classes so they keep the original look. Decorative only.
 */
const PATHS = {
  watch: (
    <>
      <circle cx="12" cy="12" r="7" />
      <path d="M12 9v6" />
      <path d="M9 12h6" />
    </>
  ),
  watching: (
    <>
      <circle cx="12" cy="12" r="7" />
      <path d="M9.5 12.5 11.5 14.5 15 10.5" />
    </>
  ),
  remove: (
    <>
      <circle cx="12" cy="12" r="7" />
      <path d="M9 12h6" />
    </>
  ),
  calendar: (
    <>
      <rect x="4.5" y="6" width="15" height="14" rx="1.8" />
      <path d="M8 3.5v4" />
      <path d="M16 3.5v4" />
      <path d="M4.5 11h15" />
    </>
  ),
  check: <path d="M5.5 12.5 10 17l8.5-9" />,
  time: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v5l3.5 2" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <line x1="16.5" y1="16.5" x2="21" y2="21" />
    </>
  ),
  x: (
    <>
      <path d="M5 5 19 19" />
      <path d="M19 5 5 19" />
    </>
  ),
  chevronLeft: <path d="M13.5 7 8.5 12l5 5" />,
  chevronRight: <path d="M10.5 7l5 5-5 5" />,
  dashboard: (
    <>
      <path d="M3.5 3.5h7v7h-7z" />
      <path d="M13.5 3.5h7v7h-7z" />
      <path d="M13.5 13.5h7v7h-7z" />
      <path d="M3.5 13.5h7v7h-7z" />
    </>
  ),
  analytics: (
    <>
      <path d="M4 16.5 9.2 10.8l3.9 3.6 6.4-7.4" />
      <path d="M4 19.5h16" />
    </>
  ),
  people: (
    <>
      <path d="M8.5 12.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z" />
      <path d="M15.5 11.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
      <path d="M3 19v-.6c0-2.6 2.1-4.7 4.7-4.7h2.2c2.6 0 4.7 2.1 4.7 4.7V19" />
      <path d="M13 19v-.2c0-2 1.6-3.6 3.5-3.6h0.8c1.9 0 3.5 1.6 3.5 3.6V19" />
    </>
  ),
  bookmark: <path d="M8 4.75h8a1 1 0 0 1 1 1v12.8l-5-2.7-5 2.7v-12.8a1 1 0 0 1 1-1z" />,
  external: (
    <>
      <path d="M14 4h6v6" />
      <path d="M20 4 10 14" />
      <path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type OldIconName = keyof typeof PATHS;

export function OldIcon({ name, size = 18, ...rest }: { name: OldIconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}
