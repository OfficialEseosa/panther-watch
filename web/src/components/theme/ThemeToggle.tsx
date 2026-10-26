"use client";

import type { ReactNode } from "react";
import { IconButton } from "@/components/ui/IconButton";
import { MonitorIcon, MoonIcon, SunIcon } from "@/components/ui/icons";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { useTheme, type ThemePreference } from "./ThemeProvider";
import styles from "./ThemeToggle.module.css";

/**
 * Header theme button (pages.md §1): flips between light and dark, labelled with what it will
 * do ("Switch to dark theme"). Picking here sets an explicit preference; "System" lives in the
 * ThemeSegmented control (menus, Settings).
 */
export function ThemeToggle({
  size = "md",
  tooltipPlacement = "bottom",
  className,
}: {
  size?: "sm" | "md";
  tooltipPlacement?: "top" | "bottom" | "right";
  className?: string;
}) {
  const { resolved, setPreference } = useTheme();
  const next = resolved === "dark" ? "light" : "dark";
  return (
    <IconButton
      size={size}
      label={`Switch to ${next} theme`}
      // Both icons render; CSS shows the right one from <html data-theme> (no server/client flicker).
      icon={
        <>
          <MoonIcon className={styles.moon} />
          <SunIcon className={styles.sun} />
        </>
      }
      onClick={() => setPreference(next)}
      tooltipPlacement={tooltipPlacement}
      className={className}
    />
  );
}

const OPTIONS: { value: ThemePreference; label: string; icon: ReactNode }[] = [
  { value: "system", label: "System", icon: <MonitorIcon /> },
  { value: "light", label: "Light", icon: <SunIcon /> },
  { value: "dark", label: "Dark", icon: <MoonIcon /> },
];

/** System / Light / Dark (spec.md §2.9), for the user menu, the More sheet and Settings. */
export function ThemeSegmented({ fullWidth = false, className }: { fullWidth?: boolean; className?: string }) {
  const { preference, setPreference } = useTheme();
  return (
    <SegmentedControl
      label="Theme"
      options={OPTIONS}
      value={preference}
      onChange={setPreference}
      fullWidth={fullWidth}
      className={className}
    />
  );
}
