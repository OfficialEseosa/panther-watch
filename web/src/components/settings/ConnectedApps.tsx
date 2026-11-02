"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RelativeTime } from "@/components/admin/RelativeTime";
import { Button, ButtonLink } from "@/components/ui/Button";
import { ArrowRightIcon, CheckIcon, CopyIcon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/Toast";
import { ApiError, del, onUnauthorized, query } from "@/lib/client/http";
import { cn } from "@/lib/ui/cn";
import { SCOPE_INFO, type Scope } from "@/lib/oauth/scopes";
import styles from "./ConnectedApps.module.css";
import ui from "./Settings.module.css";

export interface ConnectedAppView {
  clientId: string;
  name: string;
  scopes: Scope[];
  connectedAt: string;
  lastUsedAt: string | null;
}

/** The MCP connector URL with a Copy button ("Copied!" for 2 s). `large` is the /assistant version. */
export function ConnectorUrl({ mcpUrl, large = false }: { mcpUrl: string; large?: boolean }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(mcpUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.info("Copy the URL by hand", { body: mcpUrl });
    }
  };

  return (
    <div className={cn(styles.urlRow, large && styles.urlRowLarge)}>
      <code className={styles.url} aria-label="Connector URL">
        {mcpUrl}
      </code>
      <Button
        variant={large ? "primary" : "secondary"}
        size={large ? "md" : "sm"}
        onClick={copy}
        aria-live="polite"
        leadingIcon={copied ? <CheckIcon size={16} /> : <CopyIcon size={16} />}
      >
        {copied ? "Copied!" : "Copy"}
      </Button>
    </div>
  );
}

/**
 * Every app the user has allowed, each with Disconnect (revokes its tokens; it has to ask again
 * to reconnect). Shared by Settings → Connected apps and /assistant.
 */
export function ConnectedAppsList({ apps: initial }: { apps: ConnectedAppView[] }) {
  const toast = useToast();
  const router = useRouter();
  const [apps, setApps] = useState(initial);
  const [pending, setPending] = useState<string | null>(null);

  const disconnect = async (app: ConnectedAppView) => {
    setPending(app.clientId);
    try {
      await del<{ disconnected: boolean }>(`/api/account/connected-apps?${query({ clientId: app.clientId })}`);
      setApps((list) => list.filter((entry) => entry.clientId !== app.clientId));
      toast.success(`Disconnected ${app.name}`, { body: "It can't reach your account anymore. Connect it again anytime." });
      router.refresh();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) onUnauthorized(toast);
      else toast.error(`Couldn't disconnect ${app.name}`, { body: "Nothing changed. Try again in a moment." });
    }
    setPending(null);
  };

  if (apps.length === 0) {
    return (
      <p className={ui.description}>
        No apps are connected. Apps you allow show up here, and you can disconnect them anytime.
      </p>
    );
  }
  return (
    <ul className={styles.apps}>
      {apps.map((app) => (
        <li key={app.clientId} className={styles.app}>
          <div className={styles.appInfo}>
            <p className={styles.appName}>{app.name}</p>
            <p className={styles.appMeta}>{app.scopes.map((scope) => SCOPE_INFO[scope].label).join(" · ")}</p>
            <p className={styles.appMeta}>
              Connected <RelativeTime value={app.connectedAt} />
              {" · "}
              {app.lastUsedAt ? (
                <>
                  last used <RelativeTime value={app.lastUsedAt} />
                </>
              ) : (
                "not used yet"
              )}
            </p>
          </div>
          <Button
            variant="danger-ghost"
            size="sm"
            onClick={() => void disconnect(app)}
            loading={pending === app.clientId}
            aria-label={`Disconnect ${app.name}`}
          >
            Disconnect
          </Button>
        </li>
      ))}
    </ul>
  );
}

/**
 * Settings → Connected apps: a short intro linking to /assistant (the URL and the step-by-step
 * setup live there), then the connected apps with Disconnect.
 */
export function ConnectedApps({ apps }: { apps: ConnectedAppView[] }) {
  return (
    <>
      <div className={ui.item}>
        <div className={ui.info}>
          <p className={ui.label}>Connect an AI assistant</p>
          <p className={ui.description}>
            Use PantherWatch from an AI assistant that supports MCP connectors, such as Claude, ChatGPT or Cursor.
          </p>
        </div>
        <ButtonLink href="/assistant?tab=connect" variant="secondary" size="sm" trailingIcon={<ArrowRightIcon size={16} />}>
          Set it up
        </ButtonLink>
      </div>

      <div className={ui.divider} />

      <div className={styles.appsBlock}>
        <p className={ui.label}>Connected apps</p>
        <ConnectedAppsList apps={apps} />
      </div>
    </>
  );
}
