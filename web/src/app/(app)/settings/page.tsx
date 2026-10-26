import type { Metadata } from "next";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import { DeleteAccount } from "@/components/settings/DeleteAccount";
import { PageHeader } from "@/components/shell/PageHeader";
import { ThemeSegmented } from "@/components/theme/ThemeToggle";
import { Avatar } from "@/components/ui/Avatar";
import { Banner } from "@/components/ui/Banner";
import { Button, ButtonAnchor } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { LogoutIcon, MailIcon } from "@/components/ui/icons";
import { Skeleton, SkeletonGroup } from "@/components/ui/Skeleton";
import { requireUser, type CurrentUser } from "@/lib/auth/session";
import ui from "@/components/settings/Settings.module.css";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Settings" };

/**
 * /settings (pages.md §7). The header and Appearance card are static and interactive at once;
 * the user-dependent cards (profile, notifications, account) stream in behind <Suspense>.
 * proxy.ts already sends visitors without a session cookie to "/"; requireUser() also handles
 * forged or revoked cookies.
 */
export default function SettingsPage() {
  return (
    <div className={styles.page}>
      <PageHeader title="Settings" description="Appearance and your PantherWatch account." />
      <div className={ui.stack}>
        <Suspense fallback={<ProfileSkeleton />}>
          <ProfileCard />
        </Suspense>

        <Card title="Appearance">
          <div className={ui.row}>
            <div className={ui.rowText}>
              <p className={ui.rowTitle}>Theme</p>
              <p className={ui.rowBody}>System follows your device&rsquo;s light or dark setting.</p>
            </div>
            <div className={ui.rowAction}>
              <ThemeSegmented />
            </div>
          </div>
        </Card>

        <Suspense fallback={<AccountSkeleton />}>
          <AccountCards />
        </Suspense>

        <p className={ui.legal}>
          Read our <Link href="/privacy">Privacy policy</Link> and <Link href="/terms">Terms of use</Link>.
        </p>
      </div>
    </div>
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

async function ProfileCard() {
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
    <Card title="Profile">
      <div className={ui.profile}>
        <Avatar src={user.pictureUrl} name={user.name ?? user.email} size={64} />
        <div className={ui.profileText}>
          <p className={ui.name}>{user.name ?? user.email}</p>
          {user.name ? <p className={ui.profileEmail}>{user.email}</p> : null}
          <p className={ui.managed}>Signed in with Google. Your name and photo come from your Google account.</p>
        </div>
      </div>
    </Card>
  );
}

function SignOutRow() {
  return (
    <div className={ui.row}>
      <div className={ui.rowText}>
        <p className={ui.rowTitle}>Sign out</p>
        <p className={ui.rowBody}>Sign out of PantherWatch on this device.</p>
      </div>
      {/* A plain form POST: works before hydration; the route checks Origin and answers 303 -> "/". */}
      <form action="/api/auth/logout" method="post" className={ui.rowAction}>
        <Button type="submit" variant="secondary" leadingIcon={<LogoutIcon />}>
          Sign out
        </Button>
      </form>
    </div>
  );
}

async function AccountCards() {
  const user = await loadUser();
  if (!user) {
    return (
      <Card title="Account">
        <SignOutRow />
      </Card>
    );
  }
  return (
    <>
      <Card title="Notifications">
        <div className={ui.notice}>
          <span className={ui.noticeIcon} aria-hidden="true">
            <MailIcon />
          </span>
          <div className={ui.noticeText}>
            <p className={ui.noticeLead}>
              Seat alerts go to <strong className={ui.email}>{user.email}</strong>.
            </p>
            <p>
              When a seat opens in a section you&rsquo;re watching, we send one email. If the section fills up
              again, the alert re-arms on its own. To stop alerts for a class, remove it from{" "}
              <Link href="/tracked-classes">Tracked classes</Link>.
            </p>
          </div>
        </div>
      </Card>

      <Card title="Account">
        <SignOutRow />
        <hr className={ui.rule} />
        <div className={ui.row}>
          <div className={ui.rowText}>
            <p className={ui.rowTitle}>Delete account</p>
            <p className={ui.rowBody}>
              Removes your tracked classes, your schedule and your account. This can&rsquo;t be undone.
            </p>
          </div>
          <div className={ui.rowAction}>
            <DeleteAccount email={user.email} />
          </div>
        </div>
      </Card>
    </>
  );
}

function ProfileSkeleton() {
  return (
    <Card title="Profile">
      <SkeletonGroup label="Loading your profile" className={ui.profile}>
        <Skeleton width={64} height={64} radius="full" />
        <div className={ui.profileText} style={{ flex: 1 }}>
          <Skeleton width="40%" height={16} />
          <Skeleton width="55%" height={12} style={{ marginTop: "var(--space-2)" }} />
          <Skeleton width="80%" height={12} style={{ marginTop: "var(--space-2)" }} />
        </div>
      </SkeletonGroup>
    </Card>
  );
}

function AccountSkeleton() {
  return (
    <>
      {["Notifications", "Account"].map((title) => (
        <Card key={title} title={title}>
          <SkeletonGroup label={`Loading ${title.toLowerCase()}`}>
            <Skeleton width="60%" height={16} />
            <Skeleton width="90%" height={12} style={{ marginTop: "var(--space-3)" }} />
            <Skeleton width="70%" height={12} style={{ marginTop: "var(--space-2)" }} />
          </SkeletonGroup>
        </Card>
      ))}
    </>
  );
}
