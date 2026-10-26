"use client";

import { ThemeSegmented } from "@/components/theme/ThemeToggle";
import { Avatar } from "@/components/ui/Avatar";
import { ButtonAnchor } from "@/components/ui/Button";
import { AdminIcon, ChevronUpIcon, LogoutIcon, SettingsIcon, UserIcon } from "@/components/ui/icons";
import { Menu, MenuItem, MenuSeparator } from "@/components/ui/Menu";
import { Tooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/ui/cn";
import { SIGN_IN_HREF } from "./nav";
import { useSignOut } from "./useSignOut";
import { useViewer } from "./ViewerContext";
import styles from "./AccountMenu.module.css";

export type AccountMenuProps = {
  /**
   * "sidebar": avatar + name + email button (>= 1200), avatar only on the rail (900–1199).
   * "topbar": avatar button / "Sign in" (< 900).
   */
  placement: "sidebar" | "topbar";
};

/**
 * The account control: a Menu with the account summary, theme, Settings, Admin (admins only) and
 * Sign out. Guests get "Sign in with Google". Reads the viewer, so render it inside <Suspense>.
 */
export function AccountMenu({ placement }: AccountMenuProps) {
  const { user, isAdmin } = useViewer();
  const { signOut, pending } = useSignOut();

  if (!user) {
    if (placement === "topbar") {
      return (
        <ButtonAnchor href={SIGN_IN_HREF} size="sm">
          Sign in
        </ButtonAnchor>
      );
    }
    return (
      <>
        <ButtonAnchor href={SIGN_IN_HREF} fullWidth className={styles.signInFull}>
          Sign in with Google
        </ButtonAnchor>
        <Tooltip content="Sign in with Google" placement="right" showWhen="not all and (min-width: 1200px)" className={styles.railOnly}>
          <a href={SIGN_IN_HREF} className={styles.railSignIn} aria-label="Sign in with Google">
            <UserIcon size={24} />
          </a>
        </Tooltip>
      </>
    );
  }

  const displayName = user.name?.trim() || user.email;

  return (
    <Menu
      label="Account"
      side={placement === "sidebar" ? "above" : "below"}
      align={placement === "sidebar" ? "start" : "end"}
      header={
        <div className={styles.summary}>
          <p className={styles.summaryName}>{displayName}</p>
          <p className={styles.summaryEmail}>{user.email}</p>
          <ThemeSegmented fullWidth className={styles.theme} />
        </div>
      }
      // The sidebar button shows the name and email, so its accessible name must contain both
      // (WCAG 2.5.3 Label in Name); the top bar shows only the avatar.
      triggerLabel={placement === "topbar" ? `Account: ${displayName}` : `Account: ${displayName} ${user.email}`}
      triggerClassName={placement === "topbar" ? styles.avatarButton : styles.userButton}
      trigger={
        placement === "topbar" ? (
          <Avatar src={user.pictureUrl} name={displayName} size={32} />
        ) : (
          <>
            <Avatar src={user.pictureUrl} name={displayName} size={32} />
            <span className={styles.userText}>
              {/* The space keeps the name and email apart in the button's text (stacked visually). */}
              <span className={styles.userName}>{displayName}</span>{" "}
              <span className={styles.userEmail}>{user.email}</span>
            </span>
            <ChevronUpIcon size={16} className={styles.chevron} />
          </>
        )
      }
    >
      <MenuItem href="/settings" icon={<SettingsIcon />}>
        Settings
      </MenuItem>
      {isAdmin ? (
        <MenuItem href="/admin" icon={<AdminIcon />}>
          Admin
        </MenuItem>
      ) : null}
      <MenuSeparator />
      <MenuItem onSelect={() => void signOut()} icon={<LogoutIcon />} disabled={pending} tone="danger">
        Sign out
      </MenuItem>
    </Menu>
  );
}

/** Placeholder with the same box as the account control while the viewer streams in. */
export function AccountMenuFallback({ placement }: AccountMenuProps) {
  return <span className={cn(styles.fallback, placement === "topbar" && styles.fallbackTopbar)} aria-hidden="true" />;
}
