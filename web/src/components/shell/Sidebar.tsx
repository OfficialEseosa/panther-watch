"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useRef, useState } from "react";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { IconButton } from "@/components/ui/IconButton";
import { ExpandIcon, LockIcon, XIcon } from "@/components/ui/icons";
import { Tooltip } from "@/components/ui/Tooltip";
import { playExit } from "@/lib/ui/motion";
import { AccountMenu, AccountMenuFallback } from "./AccountMenu";
import { AnimatedIcon } from "./AnimatedIcon";
import { Brand } from "./Brand";
import { ADMIN_NAV, isActive, PRIMARY_NAV, SETTINGS_NAV, type NavItem } from "./nav";
import { useViewer } from "./ViewerContext";
import styles from "./Sidebar.module.css";

const RAIL_QUERY = "not all and (min-width: 1200px)";

function GuestLock() {
  const { user } = useViewer();
  if (user) return null;
  return (
    <span className={styles.lock}>
      <LockIcon size={12} />
      <span className="sr-only">, sign in required</span>
    </span>
  );
}

function AdminLink(props: { pathname: string; expanded: boolean; onNavigate?: () => void }) {
  const { isAdmin } = useViewer();
  if (!isAdmin) return null;
  return <SideNavLink item={ADMIN_NAV} {...props} />;
}

function SideNavLink({
  item,
  pathname,
  expanded,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  /** Drawer: always show labels, no rail tooltips. */
  expanded: boolean;
  onNavigate?: () => void;
}) {
  const active = isActive(item, pathname);
  const Icon = item.icon;
  const link = (
    <Link
      href={item.href}
      className={styles.link}
      data-anim-host
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
    >
      <AnimatedIcon active={active} playKey={pathname} className={styles.icon}>
        <Icon />
      </AnimatedIcon>
      <span className={styles.label}>{item.label}</span>
      {item.membersOnly ? (
        <Suspense fallback={null}>
          <GuestLock />
        </Suspense>
      ) : null}
    </Link>
  );
  return (
    <li className={styles.item}>
      {expanded ? (
        link
      ) : (
        <Tooltip content={item.label} placement="right" showWhen={RAIL_QUERY} className={styles.tipAnchor}>
          {link}
        </Tooltip>
      )}
    </li>
  );
}

function NavList({ expanded, onNavigate }: { expanded: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Primary" className={styles.nav}>
      <ul className={styles.list}>
        {PRIMARY_NAV.map((item) => (
          <SideNavLink key={item.href} item={item} pathname={pathname} expanded={expanded} onNavigate={onNavigate} />
        ))}
      </ul>
      <hr className={styles.divider} />
      <ul className={styles.list}>
        <SideNavLink item={SETTINGS_NAV} pathname={pathname} expanded={expanded} onNavigate={onNavigate} />
        <Suspense fallback={null}>
          <AdminLink pathname={pathname} expanded={expanded} onNavigate={onNavigate} />
        </Suspense>
      </ul>
    </nav>
  );
}

function LegalLinks({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <p className={styles.legal}>
      <Link href="/privacy" onClick={onNavigate}>
        Privacy
      </Link>
      <span aria-hidden="true"> · </span>
      <Link href="/terms" onClick={onNavigate}>
        Terms
      </Link>
    </p>
  );
}

/** Rail (900–1199) overlay drawer with the full sidebar (motion.md §4.15). */
function RailDrawer() {
  const ref = useRef<HTMLDialogElement>(null);
  const [mounted, setMounted] = useState(false);

  const open = () => {
    setMounted(true);
    requestAnimationFrame(() => ref.current?.showModal());
  };
  const close = () => {
    const el = ref.current;
    if (!el?.open) return;
    void playExit(el, { keep: true }).then(() => {
      el.close();
      delete el.dataset.closing;
      setMounted(false);
    });
  };

  return (
    <>
      <IconButton
        label="Expand navigation"
        icon={<ExpandIcon />}
        tooltipPlacement="right"
        className={styles.expand}
        onClick={open}
      />
      <dialog
        ref={ref}
        className={styles.drawer}
        aria-label="Navigation"
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
      >
        {mounted ? (
          <div className={styles.drawerInner}>
            <div className={styles.brandRow}>
              <Brand href="/dashboard" size={32} />
              <IconButton label="Close navigation" icon={<XIcon />} tooltip={false} onClick={close} />
            </div>
            <NavList expanded onNavigate={close} />
            <div className={styles.footer}>
              <LegalLinks onNavigate={close} />
            </div>
          </div>
        ) : null}
      </dialog>
    </>
  );
}

/**
 * Desktop navigation (spec.md §2.15): a 72 px icon rail at 900–1199 px (labels in tooltips,
 * expand to a drawer) and the full 248 px sidebar at >= 1200 px. Hidden below 900 px, where the
 * top bar and bottom nav take over.
 */
export function Sidebar() {
  return (
    <aside className={styles.sidebar}>
      <div className={styles.brandRow}>
        <Brand href="/dashboard" size={32} nameClassName={styles.brandName} />
      </div>
      <NavList expanded={false} />
      <div className={styles.footer}>
        <Suspense fallback={<AccountMenuFallback placement="sidebar" />}>
          <AccountMenu placement="sidebar" />
        </Suspense>
        <div className={styles.railOnly}>
          <ThemeToggle tooltipPlacement="right" />
          <RailDrawer />
        </div>
        <div className={styles.fullOnly}>
          <LegalLinks />
          <ThemeToggle size="sm" tooltipPlacement="top" />
        </div>
      </div>
    </aside>
  );
}

