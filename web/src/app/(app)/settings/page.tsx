import type { Metadata } from "next";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import type { ReactNode } from "react";
import { DeleteAccount } from "@/components/settings/DeleteAccount";
import { PageHeader } from "@/components/shell/PageHeader";
import { ThemeSegmented } from "@/components/theme/ThemeToggle";
import { Avatar } from "@/components/ui/Avatar";
import { Banner } from "@/components/ui/Banner";
import { ButtonAnchor } from "@/components/ui/Button";
import { LogoutIcon, MailIcon, MoonIcon, UserIcon, AlertIcon } from "@/components/ui/icons";
import { Skeleton, SkeletonGroup } from "@/components/ui/Skeleton";
import { requireUser, type CurrentUser } from "@/lib/auth/session";
import ui from "@/components/settings/Settings.module.css";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Settings" };

/**
 * /settings: the original Settings page (old Settings.jsx): one card per section (Profile,
 * Appearance, Notifications, Account actions), each with an icon + title header. The header and
 * Appearance are static; the user-dependent sections stream in behind <Suspense>. proxy.ts
 * already sends visitors without a session cookie to "/"; requireUser() handles forged cookies.
 */
export default function SettingsPage() {
  return (
    <div className={styles.page}>
      <PageHeader
        title="Settings"
        description="Manage your account preferences, appearance, and personal information."
      />
      <div className={ui.content}>
        <Suspense fallback={<ProfileSkeleton />}>
          <ProfileSection />
        </Suspense>

        <Section icon={<MoonIcon />} title="Appearance">
          <div className={ui.item}>
            <div className={ui.info}>
              <p className={ui.label}>Theme</p>
              <p className={ui.description}>System follows your device&rsquo;s light or dark setting.</p>
            </div>
            <ThemeSegmented />
          </div>
        </Section>

        <Suspense fallback={<AccountSkeleton />}>
          <AccountSections />
        </Suspense>

        <p className={ui.legal}>
          Read our <Link href="/privacy">Privacy Policy</Link> and <Link href="/terms">Terms of Service</Link>.
        </p>
      </div>
    </div>
  );
}

/** A settings card: icon + title header over a rule, then the content (old .settings-section). */
function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  const id = `settings-${title.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <section className={ui.section} aria-labelledby={id}>
      <div className={ui.sectionHeader}>
        <span className={ui.sectionIcon} aria-hidden="true">
          {icon}
        </span>
        <h2 id={id} className={ui.sectionTitle}>
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

/** The signed-in user, or null when the lookup failed (DB down). Redirects to "/" when signed out. */
async function loadUser(): Promise<CurrentUser | null> {
  try {
    return await requireUser();
  } catch (error) {
    unstable_rethrow(error);
    console.error("settings: could not load the current user", error instanceof Error ? error.name : typeof error);
    return null;
  }
}

async function ProfileSection() {
  const user = await loadUser();
  if (!user) {
    return (
      <Banner
        tone="danger"
        title="We couldn't load your account."
        action={
          <ButtonAnchor href="/settings" size="sm" variant="secondary">
            Try again
          </ButtonAnchor>
        }
      >
        Your data is safe. Theme settings below still work; try again in a moment for the rest.
      </Banner>
    );
  }
  return (
    <Section icon={<UserIcon />} title="Profile">
      <div className={ui.profile}>
        <Avatar src={user.pictureUrl} name={user.name ?? user.email} size={64} className={ui.avatar} />
        <div className={ui.profileDetails}>
          <p className={ui.profileName}>{user.name ?? user.email}</p>
          {user.name ? <p className={ui.profileEmail}>{user.email}</p> : null}
          <p className={ui.managed}>Signed in with Google. Your name and photo come from your Google account.</p>
        </div>
      </div>
    </Section>
  );
}

function SignOutAction() {
  return (
    // A plain form POST: works before hydration; the route checks Origin and answers 303 -> "/".
    <form action="/api/auth/logout" method="post">
      <button type="submit" className={`${ui.action} ${ui.actionLogout}`}>
        <LogoutIcon className={ui.actionIcon} />
        <span className={ui.actionInfo}>
          <span className={ui.actionLabel}>Sign out</span>
          <span className={ui.actionDescription}>Sign out of PantherWatch on this device</span>
        </span>
      </button>
    </form>
  );
}

async function AccountSections() {
  const user = await loadUser();
  if (!user) {
    return (
      <Section icon={<AlertIcon />} title="Account actions">
        <SignOutAction />
      </Section>
    );
  }
  return (
    <>
      <Section icon={<MailIcon />} title="Notifications">
        <div className={ui.notice}>
          <p className={ui.noticeLead}>
            Seat alerts go to <strong className={ui.email}>{user.email}</strong>.
          </p>
          <p className={ui.description}>
            When a seat opens in a section you&rsquo;re watching, we send one email. If the section fills up again,
            the alert re-arms on its own. To stop alerts for a class, remove it from{" "}
            <Link href="/tracked-classes">Tracked classes</Link>.
          </p>
        </div>
      </Section>

      <Section icon={<AlertIcon />} title="Account actions">
        <SignOutAction />
        <div className={ui.divider} />
        <DeleteAccount email={user.email} />
      </Section>
    </>
  );
}

function ProfileSkeleton() {
  return (
    <Section icon={<UserIcon />} title="Profile">
      <SkeletonGroup label="Loading your profile" className={ui.profile}>
        <Skeleton width={64} height={64} radius="full" />
        <div className={ui.profileDetails} style={{ flex: 1 }}>
          <Skeleton width="40%" height={16} />
          <Skeleton width="55%" height={12} style={{ marginTop: "var(--space-2)" }} />
          <Skeleton width="80%" height={12} style={{ marginTop: "var(--space-2)" }} />
        </div>
      </SkeletonGroup>
    </Section>
  );
}

function AccountSkeleton() {
  return (
    <>
      {[
        { title: "Notifications", icon: <MailIcon /> },
        { title: "Account actions", icon: <AlertIcon /> },
      ].map(({ title, icon }) => (
        <Section key={title} icon={icon} title={title}>
          <SkeletonGroup label={`Loading ${title.toLowerCase()}`}>
            <Skeleton width="60%" height={16} />
            <Skeleton width="90%" height={12} style={{ marginTop: "var(--space-3)" }} />
            <Skeleton width="70%" height={12} style={{ marginTop: "var(--space-2)" }} />
          </SkeletonGroup>
        </Section>
      ))}
    </>
  );
}
