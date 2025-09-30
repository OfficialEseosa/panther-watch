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
  )
};

function Icon({ name, size = 20, strokeWidth = 1.7, className, ariaLabel, ...rest }) {
  const icon = ICONS[name];

  if (!icon) {
    return null;
  }

  const role = ariaLabel ? "img" : "presentation";
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
