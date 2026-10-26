import {
  AdminIcon,
  BookmarkIcon,
  CalendarIcon,
  DashboardIcon,
  SearchIcon,
  SettingsIcon,
  type IconComponent,
} from "@/components/ui/icons";

export type NavItem = {
  href: string;
  /** Sidebar / drawer label. */
  label: string;
  /** Bottom-nav label (12 px, 1/5 of the width). */
  shortLabel: string;
  /** Top-bar title on < 900 px. */
  title: string;
  icon: IconComponent;
  /** Other paths that count as this item (e.g. results under Search). */
  alsoMatches?: string[];
  /** Guests see a lock glyph (the route renders a sign-in empty state for them). */
  membersOnly?: boolean;
  adminOnly?: boolean;
};

/** Primary navigation, in order (spec.md §2.15). Schedule builder was missing from the old sidebar. */
export const PRIMARY_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", shortLabel: "Dashboard", title: "Dashboard", icon: DashboardIcon },
  {
    href: "/course-search",
    label: "Course search",
    shortLabel: "Search",
    title: "Search classes",
    icon: SearchIcon,
    alsoMatches: ["/course-results"],
  },
  {
    href: "/tracked-classes",
    label: "Tracked classes",
    shortLabel: "Tracked",
    title: "Tracked classes",
    icon: BookmarkIcon,
    membersOnly: true,
  },
  {
    href: "/schedule-builder",
    label: "Schedule builder",
    shortLabel: "Schedule",
    title: "Schedule",
    icon: CalendarIcon,
    membersOnly: true,
  },
];

export const SETTINGS_NAV: NavItem = {
  href: "/settings",
  label: "Settings",
  shortLabel: "Settings",
  title: "Settings",
  icon: SettingsIcon,
};

export const ADMIN_NAV: NavItem = {
  href: "/admin",
  label: "Admin",
  shortLabel: "Admin",
  title: "Admin",
  icon: AdminIcon,
  adminOnly: true,
};

export const SIGN_IN_HREF = "/api/auth/google/login";

export function isActive(item: NavItem, pathname: string): boolean {
  const matches = (base: string) => pathname === base || pathname.startsWith(`${base}/`);
  return matches(item.href) || (item.alsoMatches ?? []).some(matches);
}

/** Title for the top bar, from the current path. */
export function titleFor(pathname: string): string {
  const item = [...PRIMARY_NAV, SETTINGS_NAV, ADMIN_NAV].find((entry) => isActive(entry, pathname));
  return item?.title ?? "PantherWatch";
}
