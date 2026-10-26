"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useState } from "react";
import { ThemeSegmented } from "@/components/theme/ThemeToggle";
import { ButtonAnchor, Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { ChevronRightIcon, LockIcon, LogoutIcon, MoreIcon } from "@/components/ui/icons";
import { cn } from "@/lib/ui/cn";
import { ADMIN_NAV, isActive, PRIMARY_NAV, SETTINGS_NAV, SIGN_IN_HREF, type NavItem } from "./nav";
import { useSignOut } from "./useSignOut";
import { useViewer } from "./ViewerContext";
import styles from "./MobileNav.module.css";

function GuestLock() {
  const { user } = useViewer();
  if (user) return null;
  return (
    <span className={styles.lock} aria-hidden="true">
      <LockIcon size={12} />
    </span>
  );
}

function GuestNote() {
  const { user } = useViewer();
  return user ? null : <span className="sr-only">, sign in required</span>;
}

function SheetLink({ item, onNavigate }: { item: NavItem; onNavigate: () => void }) {
  const pathname = usePathname();
  const Icon = item.icon;
  return (
    <li>
      <Link
        href={item.href}
        className={styles.row}
        aria-current={isActive(item, pathname) ? "page" : undefined}
        onClick={onNavigate}
      >
        <Icon className={styles.rowIcon} />
        <span className={styles.rowLabel}>{item.label}</span>
        <ChevronRightIcon size={16} className={styles.rowChevron} />
      </Link>
    </li>
  );
}

function AdminRow({ onNavigate }: { onNavigate: () => void }) {
  const { isAdmin } = useViewer();
  return isAdmin ? <SheetLink item={ADMIN_NAV} onNavigate={onNavigate} /> : null;
}

function AccountRow() {
  const { user } = useViewer();
  const { signOut, pending } = useSignOut();
  if (!user) {
    return (
      <ButtonAnchor href={SIGN_IN_HREF} fullWidth>
        Sign in with Google
      </ButtonAnchor>
    );
  }
  return (
    <Button variant="secondary" fullWidth leadingIcon={<LogoutIcon />} loading={pending} onClick={() => void signOut()}>
      Sign out
    </Button>
  );
}

/**
 * Bottom navigation for < 900 px (spec.md §2.15): Dashboard, Search, Tracked, Schedule, More.
 * "More" opens a sheet with Settings, Admin (admins), theme, Privacy, Terms and Sign out.
 */
export function MobileNav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const close = () => setMoreOpen(false);
  const moreActive = [SETTINGS_NAV, ADMIN_NAV].some((item) => isActive(item, pathname));

  return (
    <>
      <nav aria-label="Primary" className={styles.bar} data-bottom-nav="">
        <ul className={styles.list}>
          {PRIMARY_NAV.map((item) => {
            const Icon = item.icon;
            const active = isActive(item, pathname);
            return (
              <li key={item.href} className={styles.cell}>
                <Link href={item.href} className={styles.item} aria-current={active ? "page" : undefined}>
                  <span className={styles.pill}>
                    <Icon size={24} />
                    {item.membersOnly ? (
                      <Suspense fallback={null}>
                        <GuestLock />
                      </Suspense>
                    ) : null}
                  </span>
                  <span className={styles.label}>{item.shortLabel}</span>
                  {item.membersOnly ? (
                    <Suspense fallback={null}>
                      <GuestNote />
                    </Suspense>
                  ) : null}
                </Link>
              </li>
            );
          })}
          <li className={styles.cell}>
            <button
              type="button"
              className={cn(styles.item, moreActive && styles.itemActive)}
              aria-haspopup="dialog"
              aria-expanded={moreOpen}
              onClick={() => setMoreOpen(true)}
            >
              <span className={styles.pill}>
                <MoreIcon size={24} />
              </span>
              <span className={styles.label}>More</span>
            </button>
          </li>
        </ul>
      </nav>

      <Dialog open={moreOpen} onClose={close} title="More" size="sm">
        <ul className={styles.rows}>
          <SheetLink item={SETTINGS_NAV} onNavigate={close} />
          <Suspense fallback={null}>
            <AdminRow onNavigate={close} />
          </Suspense>
        </ul>
        <div className={styles.section}>
          <p className={styles.sectionLabel}>Theme</p>
          <ThemeSegmented fullWidth />
        </div>
        <div className={styles.section}>
          <Suspense fallback={null}>
            <AccountRow />
          </Suspense>
        </div>
        <p className={styles.legal}>
          <Link href="/privacy" onClick={close}>
            Privacy
          </Link>
          <span aria-hidden="true"> · </span>
          <Link href="/terms" onClick={close}>
            Terms
          </Link>
        </p>
      </Dialog>
    </>
  );
}
