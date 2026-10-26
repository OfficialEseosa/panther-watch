import type { ReactNode, SVGProps } from "react";

/**
 * PantherWatch icon set (spec.md §1.9): 24×24 viewBox, 1.75 stroke, currentColor.
 * Each icon is its own named export, so unused icons are tree-shaken.
 *
 *   import { SearchIcon } from "@/components/ui/icons";
 *   <SearchIcon />                 // 20 px, aria-hidden (decorative)
 *   <SearchIcon size={16} />
 *
 * Icons are always decorative: an icon-only control gets its name from the control's
 * `aria-label`, never from the SVG.
 */
export type IconProps = Omit<SVGProps<SVGSVGElement>, "children"> & {
  /** Rendered size in px: 16 (sm controls, badges), 20 (default) or 24 (bottom nav, empty states). */
  size?: number;
};

export type IconComponent = (props: IconProps) => ReactNode;

function createIcon(name: string, paths: ReactNode): IconComponent {
  function Icon({ size = 20, strokeWidth = 1.75, ...rest }: IconProps) {
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
        aria-hidden="true"
        focusable="false"
        data-icon={name}
        {...rest}
      >
        {paths}
      </svg>
    );
  }
  Icon.displayName = `${name}Icon`;
  return Icon;
}

/* Navigation */
export const DashboardIcon = createIcon("dashboard", (
  <>
    <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
    <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
    <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
  </>
));
export const SearchIcon = createIcon("search", (
  <>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4.5 4.5" />
  </>
));
export const BookmarkIcon = createIcon("bookmark", (
  <path d="M8 4.75h8a1 1 0 0 1 1 1v13.5l-5-2.9-5 2.9V5.75a1 1 0 0 1 1-1z" />
));
export const CalendarIcon = createIcon("calendar", (
  <>
    <rect x="4" y="5.5" width="16" height="14.5" rx="2" />
    <path d="M8 3.5v4M16 3.5v4M4 10.5h16" />
  </>
));
export const CalendarPlusIcon = createIcon("calendarPlus", (
  <>
    <rect x="4" y="5.5" width="16" height="14.5" rx="2" />
    <path d="M8 3.5v4M16 3.5v4M4 10.5h16M12 13v5M9.5 15.5h5" />
  </>
));
export const CalendarCheckIcon = createIcon("calendarCheck", (
  <>
    <rect x="4" y="5.5" width="16" height="14.5" rx="2" />
    <path d="M8 3.5v4M16 3.5v4M4 10.5h16M9 15.5l2 2 4-4" />
  </>
));
export const SettingsIcon = createIcon("settings", (
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </>
));
export const AdminIcon = createIcon("admin", (
  <>
    <path d="M12 3.8 5.5 6.2v5.6c0 3.8 2.7 7 6.5 7.9 3.8-.9 6.5-4.1 6.5-7.9V6.2L12 3.8z" />
    <path d="m9.5 12 1.8 1.8 3.4-3.6" />
  </>
));
export const MoreIcon = createIcon("more", (
  <>
    <circle cx="5.5" cy="12" r="1" fill="currentColor" />
    <circle cx="12" cy="12" r="1" fill="currentColor" />
    <circle cx="18.5" cy="12" r="1" fill="currentColor" />
  </>
));
export const ExpandIcon = createIcon("expand", (
  <>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
    <path d="M9 4.5v15M12.5 10l2 2-2 2" />
  </>
));
export const LogoutIcon = createIcon("logout", (
  <>
    <path d="M9 20.5H5.5a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2H9" />
    <path d="m16 16.5 4.5-4.5L16 7.5M20.5 12H9" />
  </>
));

/* Status and feedback */
export const CheckIcon = createIcon("check", <path d="m5.5 12.5 4.5 4.5 8.5-9" />);
export const XIcon = createIcon("x", <path d="M6 6l12 12M18 6 6 18" />);
export const AlertIcon = createIcon("alert", (
  <>
    <path d="M10.3 4.3 2.9 17.5A2 2 0 0 0 4.6 20.5h14.8a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0z" />
    <path d="M12 9.5v4M12 17h.01" />
  </>
));
export const AlertCircleIcon = createIcon("alertCircle", (
  <>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 8v4.5M12 16h.01" />
  </>
));
export const InfoIcon = createIcon("info", (
  <>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 11v5M12 8h.01" />
  </>
));
export const CheckCircleIcon = createIcon("checkCircle", (
  <>
    <circle cx="12" cy="12" r="8.5" />
    <path d="m8.5 12.3 2.3 2.3 4.7-5" />
  </>
));
export const LockIcon = createIcon("lock", (
  <>
    <rect x="5" y="10.5" width="14" height="10" rx="2" />
    <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
  </>
));
export const ClockIcon = createIcon("clock", (
  <>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </>
));
export const BellIcon = createIcon("bell", (
  <>
    <path d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 2h-15z" />
    <path d="M10 20.5a2 2 0 0 0 4 0" />
  </>
));
export const EyeIcon = createIcon("eye", (
  <>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
    <circle cx="12" cy="12" r="3" />
  </>
));
export const EyeCheckIcon = createIcon("eyeCheck", (
  <>
    <path d="M21.2 11.2C19.9 9 16.8 5.5 12 5.5 6 5.5 2.5 12 2.5 12S6 18.5 12 18.5c.6 0 1.1 0 1.6-.1" />
    <circle cx="12" cy="12" r="3" />
    <path d="m15.5 17.5 2 2 4-4" />
  </>
));

/* Actions */
export const PlusIcon = createIcon("plus", <path d="M12 5v14M5 12h14" />);
export const TrashIcon = createIcon("trash", (
  <>
    <path d="M4.5 7h15M9.5 7V4.5h5V7" />
    <path d="M6.5 7l.8 12.1a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4L17.5 7M10 11v6M14 11v6" />
  </>
));
export const DownloadIcon = createIcon("download", (
  <path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M4.5 19.5h15" />
));
export const ExternalIcon = createIcon("external", (
  <>
    <path d="M14 4h6v6M20 4l-9 9" />
    <path d="M18.5 14v4.5a1.5 1.5 0 0 1-1.5 1.5H5.5A1.5 1.5 0 0 1 4 18.5V7a1.5 1.5 0 0 1 1.5-1.5H10" />
  </>
));
export const MailIcon = createIcon("mail", (
  <>
    <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
    <path d="m4.5 7 7.5 5.5L19.5 7" />
  </>
));
export const CopyIcon = createIcon("copy", (
  <>
    <rect x="8.5" y="8.5" width="11" height="11" rx="2" />
    <path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5" />
  </>
));
export const PlayIcon = createIcon("play", <path d="M8 5.5v13l10-6.5z" />);
export const PauseIcon = createIcon("pause", <path d="M9 5.5v13M15 5.5v13" />);
export const RefreshIcon = createIcon("refresh", (
  <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4" />
));
export const FilterIcon = createIcon("filter", <path d="M4 6h16M7 12h10M10 18h4" />);

/* People */
export const UserIcon = createIcon("user", (
  <>
    <circle cx="12" cy="8" r="4" />
    <path d="M4.5 20v-1c0-3 3.4-5.5 7.5-5.5s7.5 2.5 7.5 5.5v1" />
  </>
));
export const UsersIcon = createIcon("users", (
  <>
    <circle cx="9" cy="8.5" r="3.5" />
    <path d="M2.5 19.5v-.5c0-2.8 2.9-5 6.5-5s6.5 2.2 6.5 5v.5" />
    <path d="M15.5 5.2a3.5 3.5 0 0 1 0 6.6M18 14.3c2 .8 3.5 2.4 3.5 4.7v.5" />
  </>
));

/* Theme */
export const SunIcon = createIcon("sun", (
  <>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" />
  </>
));
export const MoonIcon = createIcon("moon", <path d="M20.5 13.2A8.5 8.5 0 1 1 10.8 3.5a6.6 6.6 0 0 0 9.7 9.7z" />);
export const MonitorIcon = createIcon("monitor", (
  <>
    <rect x="3" y="4.5" width="18" height="12" rx="2" />
    <path d="M8.5 20h7M12 16.5V20" />
  </>
));

/* Chevrons (no rotated chevronDown) */
export const ChevronDownIcon = createIcon("chevronDown", <path d="m7 10 5 5 5-5" />);
export const ChevronUpIcon = createIcon("chevronUp", <path d="m7 14 5-5 5 5" />);
export const ChevronLeftIcon = createIcon("chevronLeft", <path d="m14.5 7-5 5 5 5" />);
export const ChevronRightIcon = createIcon("chevronRight", <path d="m9.5 7 5 5-5 5" />);
export const ArrowRightIcon = createIcon("arrowRight", <path d="M4.5 12h15m0 0-5.5-5.5M19.5 12 14 17.5" />);

/* Data */
export const ChartIcon = createIcon("chart", <path d="M4 19.5h16M7.5 16v-4M12 16V8M16.5 16v-6" />);
export const StarIcon = createIcon("star", (
  <path d="m12 3.8 2.5 5.2 5.7.8-4.1 4 1 5.6L12 16.7l-5.1 2.7 1-5.6-4.1-4 5.7-.8z" />
));
