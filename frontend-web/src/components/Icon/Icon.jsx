const ICONS = {
  dashboard: (
    <>
      <path d="M3.5 3.5h7v7h-7z" />
      <path d="M13.5 3.5h7v7h-7z" />
      <path d="M13.5 13.5h7v7h-7z" />
      <path d="M3.5 13.5h7v7h-7z" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <line x1="16.5" y1="16.5" x2="21" y2="21" />
    </>
  ),
  bookmark: (
    <>
      <path d="M8 4.75h8a1 1 0 0 1 1 1v12.8l-5-2.7-5 2.7v-12.8a1 1 0 0 1 1-1z" />
    </>
  ),
  analytics: (
    <>
      <path d="M4 16.5 9.2 10.8l3.9 3.6 6.4-7.4" />
      <path d="M4 19.5h16" />
    </>
  ),
  admin: (
    <>
      <path d="M12 3.8 5.5 6v6c0 3.7 2.6 6.9 6.5 7.6 3.9-.7 6.5-3.9 6.5-7.6V6L12 3.8z" />
      <path d="M9.7 11.6 12 13.9l4.1-4.1" />
    </>
  ),
  logout: (
    <>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17 21 12 16 7" />
      <path d="M21 12H9" />
    </>
  ),
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
  classes: (
    <>
      <path d="M6 4.5h12a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 18V6A1.5 1.5 0 0 1 6 4.5z" />
      <path d="M6 9h12" />
      <path d="M6 15h6" />
      <path d="M9 4v3" />
      <path d="M15 4v3" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="M4.93 4.93 6.34 6.34" />
      <path d="M17.66 17.66 19.07 19.07" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="M4.93 19.07 6.34 17.66" />
      <path d="M17.66 6.34 19.07 4.93" />
    </>
  ),
  moon: (
    <>
      <path d="M21 12.8A9 9 0 1 1 11.2 3a6.7 6.7 0 0 0 9.8 9.8z" />
    </>
  ),
  chevronDown: (
    <>
      <path d="M7 10.5 12 15.5 17 10.5" />
    </>
  ),
  users: (
    <>
      <path d="M8.5 12.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z" />
      <path d="M15.5 11.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
      <path d="M3 19v-.6c0-2.6 2.1-4.7 4.7-4.7h2.2c2.6 0 4.7 2.1 4.7 4.7V19" />
      <path d="M13 19v-.2c0-2 1.6-3.6 3.5-3.6h0.8c1.9 0 3.5 1.6 3.5 3.6V19" />
    </>
  ),
  userCheck: (
    <>
      <path d="M12 12.5a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
      <path d="M4 20v-.6C4 15.7 7.1 13 10.9 13h.2" />
      <path d="m15.5 16.5 1.8 1.8L21 14.5" />
    </>
  ),
  gauge: (
    <>
      <path d="M5 18a7 7 0 0 1 14 0" />
      <path d="M12 12v3.8" />
      <path d="m9.2 14.3 1.3-1.3" />
      <path d="m14.8 14.3-1.3-1.3" />
      <path d="M4 18h16" />
    </>
  ),
  mail: (
    <>
      <rect x="3.5" y="6" width="17" height="12" rx="1.8" />
      <path d="M4.5 7l7.5 5 7.5-5" />
    </>
  ),
  x: (
    <>
      <path d="M5 5 19 19" />
      <path d="M19 5 5 19" />
    </>
  ),
  shieldOff: (
    <>
      <path d="M6 6.3V6l6-2.4L18 6v6.2c0 3.6-2.5 6.9-6 7.8" />
      <path d="M3 3l18 18" />
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
  check: (
    <>
      <path d="M5.5 12.5 10 17l8.5-9" />
    </>
  ),
  phone: (
    <>
      <path d="M8.5 3h7a1.5 1.5 0 0 1 1.5 1.5v15a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 7 19.5v-15A1.5 1.5 0 0 1 8.5 3z" />
      <path d="M12 18h.01" />
    </>
  ),
  trash: (
    <>
      <path d="M5 7h14" />
      <path d="M9 7V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V7" />
      <path d="M6.5 7h11v12.5a1.5 1.5 0 0 1-1.5 1.5H8a1.5 1.5 0 0 1-1.5-1.5V7z" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </>
  ),
  alertTriangle: (
    <>
      <path d="M12 3L2.5 20h19L12 3z" />
      <path d="M12 9v5" />
      <path d="M12 17h.01" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v3m0 16v3M4.22 4.22l2.12 2.12m11.32 11.32l2.12 2.12M1 12h3m16 0h3M4.22 19.78l2.12-2.12m11.32-11.32l2.12-2.12" />
    </>
  ),
  close: (
    <>
      <path d="M5 5 19 19" />
      <path d="M19 5 5 19" />
    </>
  ),
  'chevron-back': (
    <>
      <path d="M15 18 9 12 15 6" />
    </>
  ),
  'chevron-forward': (
    <>
      <path d="M9 18 15 12 9 6" />
    </>
  ),
  checkmark: (
    <>
      <path d="M5.5 12.5 10 17l8.5-9" />
    </>
  ),
  notifications: (
    <>
      <path d="M12 3c-1.4 0-2.6.7-3.4 1.8C7.9 5.9 7.5 7.4 7.5 9v3.5c0 .9-.4 1.8-1 2.5l-1 1V18h14v-2l-1-1c-.6-.7-1-1.6-1-2.5V9c0-1.6-.4-3.1-1.1-4.2C15.6 3.7 14.4 3 12 3z" />
      <path d="M10.5 18v.5a1.5 1.5 0 0 0 3 0V18" />
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
  'stats-chart': (
    <>
      <path d="M4 19.5h16" />
      <path d="M8 15.5V19.5" />
      <path d="M12 11.5V19.5" />
      <path d="M16 7.5V19.5" />
      <path d="M20 4.5V19.5" />
    </>
  ),
  pause: (
    <>
      <rect x="7" y="5" width="3" height="14" rx="0.5" />
      <rect x="14" y="5" width="3" height="14" rx="0.5" />
    </>
  ),
  time: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v5l3.5 2" />
    </>
  ),
  edit: (
    <>
      <path d="M4 20h4l10.5-10.5a2.828 2.828 0 1 0-4-4L4 16v4z" />
      <path d="M13.5 6.5l4 4" />
    </>
  )
};

function Icon({ name, size = 20, strokeWidth = 1.7, className, ariaLabel, ...rest }) {
  const icon = ICONS[name];

  if (!icon) {
    return null;
  }

  const role = ariaLabel ? 'img' : 'presentation';
  const ariaHidden = ariaLabel ? undefined : true;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden={ariaHidden}
      aria-label={ariaLabel}
      role={role}
      {...rest}
    >
      {icon}
    </svg>
  );
}

export default Icon;
