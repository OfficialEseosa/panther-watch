import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense, type ReactNode } from "react";
import ui from "@/components/settings/Settings.module.css";
import { Avatar } from "@/components/ui/Avatar";
import { Banner } from "@/components/ui/Banner";
import { Button, ButtonLink } from "@/components/ui/Button";
import { AlertIcon, PlugIcon } from "@/components/ui/icons";
import { Skeleton, SkeletonGroup } from "@/components/ui/Skeleton";
import { AUTHORIZE_PATH } from "@/lib/auth/next";
import { getCurrentUser } from "@/lib/auth/session";
import { checkAuthorizeRequest, loopbackOnly, SCOPE_INFO, REQUIRED_SCOPE, toSearchParams } from "@/lib/oauth";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Connect an app",
  robots: { index: false, follow: false },
};

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * /connect: the OAuth consent page. GET /api/oauth/authorize sends signed-in users here with
 * the authorization request's query; this page re-validates it (the same checks), shows which
 * app is asking, where it will send them back (the redirect host, which the MCP spec requires
 * us to show), and what it may do. Read access is always included; the two write permissions
 * are checkboxes, ticked by default. The form posts to /api/oauth/authorize/decision.
 */
export default function ConnectPage({ searchParams }: PageProps) {
  return (
    <div className={styles.page}>
      <Suspense fallback={<ConsentSkeleton />}>
        <Consent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

function Card({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className={`${ui.section} ${styles.card}`} aria-labelledby="connect-title">
      <div className={ui.sectionHeader}>
        <span className={ui.sectionIcon} aria-hidden="true">
          {icon}
        </span>
        <h1 id="connect-title" className={ui.sectionTitle}>
          {title}
        </h1>
      </div>
      {children}
    </section>
  );
}

function Problem({ message }: { message: string }) {
  return (
    <Card icon={<AlertIcon />} title="This connection can't continue">
      <p className={styles.lead}>{message}</p>
      <p className={ui.description}>
        Go back to the app and start connecting PantherWatch again. If it keeps happening, the app may not support
        PantherWatch yet.
      </p>
      <div className={styles.actions}>
        <ButtonLink href="/settings#settings-connected-apps" variant="secondary">
          Connected apps
        </ButtonLink>
      </div>
    </Card>
  );
}

function hostOf(uri: string): string {
  try {
    const url = new URL(uri);
    return url.port ? `${url.hostname}:${url.port}` : url.hostname;
  } catch {
    return uri;
  }
}

async function Consent({ searchParams }: PageProps) {
  await connection();
  const params = toSearchParams(await searchParams);
  if (!params.has("client_id")) {
    return (
      <Card icon={<PlugIcon />} title="Connect an app">
        <p className={styles.lead}>Nothing is waiting to connect.</p>
        <p className={ui.description}>
          To use PantherWatch from Claude, add the connector URL from{" "}
          <Link href="/settings#settings-connected-apps">Settings → Connected apps</Link> in Claude. Claude then opens
          this page so you can allow it.
        </p>
      </Card>
    );
  }

  const check = await checkAuthorizeRequest(params);
  if (!check.ok) {
    if (check.kind === "redirect") redirect(check.location);
    return <Problem message={check.message} />;
  }
  const user = await getCurrentUser();
  if (!user) redirect(`/?next=${encodeURIComponent(`${AUTHORIZE_PATH}?${params.toString()}`)}`);

  const { client, redirectUri, scopes } = check.request;
  const writeScopes = scopes.filter((scope) => scope !== REQUIRED_SCOPE);
  const returnHost = hostOf(redirectUri);
  const local = loopbackOnly([redirectUri]);

  return (
    <Card icon={<PlugIcon />} title={`Connect ${client.name}`}>
      <div className={styles.who}>
        <p className={styles.lead}>
          <strong className={styles.app}>{client.name}</strong> wants to use your PantherWatch account.
        </p>
        <div className={styles.account}>
          <Avatar src={user.pictureUrl} name={user.name ?? user.email} size={24} />
          <span className={styles.accountText}>
            Signed in as <strong>{user.email}</strong>
          </span>
        </div>
      </div>

      {local ? (
        <Banner tone="warning" title="This app runs on your own computer.">
          It will return to {returnHost}. Only allow it if you just started connecting it yourself.
        </Banner>
      ) : null}

      <form method="post" action="/api/oauth/authorize/decision" className={styles.form}>
        <input type="hidden" name="request" value={params.toString()} />
        <fieldset className={styles.permissions}>
          <legend className={ui.label}>It will be able to</legend>
          <ul className={styles.list}>
            <li className={styles.permission}>
              <input type="checkbox" checked disabled aria-describedby="scope-read" id="scope-read-box" />
              <label htmlFor="scope-read-box" className={styles.permissionText}>
                <span className={styles.permissionLabel}>{SCOPE_INFO.read.label}</span>
                <span id="scope-read" className={styles.permissionDescription}>
                  {SCOPE_INFO.read.description} Always included.
                </span>
              </label>
            </li>
            {writeScopes.map((scope) => (
              <li key={scope} className={styles.permission}>
                <input
                  type="checkbox"
                  name="scope"
                  value={scope}
                  defaultChecked
                  id={`scope-${scope}`}
                  aria-describedby={`scope-${scope}-description`}
                />
                <label htmlFor={`scope-${scope}`} className={styles.permissionText}>
                  <span className={styles.permissionLabel}>{SCOPE_INFO[scope].label}</span>
                  <span id={`scope-${scope}-description`} className={styles.permissionDescription}>
                    {SCOPE_INFO[scope].description}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>

        <p className={ui.description}>
          After you choose, you&rsquo;ll go back to <strong className={styles.host}>{returnHost}</strong>. It never sees
          your Google password, and you can disconnect it anytime in{" "}
          <Link href="/settings#settings-connected-apps">Settings → Connected apps</Link>.
        </p>

        <div className={styles.actions}>
          <Button type="submit" name="decision" value="deny" variant="secondary">
            Deny
          </Button>
          <Button type="submit" name="decision" value="allow">
            Allow
          </Button>
        </div>
      </form>
    </Card>
  );
}

function ConsentSkeleton() {
  return (
    <Card icon={<PlugIcon />} title="Connect an app">
      <SkeletonGroup label="Loading the connection request">
        <Skeleton width="70%" height={16} />
        <Skeleton width="45%" height={12} style={{ marginTop: "var(--space-3)" }} />
        <Skeleton width="90%" height={12} style={{ marginTop: "var(--space-4)" }} />
        <Skeleton width="85%" height={12} style={{ marginTop: "var(--space-2)" }} />
      </SkeletonGroup>
    </Card>
  );
}
