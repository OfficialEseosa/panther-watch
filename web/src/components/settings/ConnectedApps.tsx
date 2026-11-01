"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RelativeTime } from "@/components/admin/RelativeTime";
import { Button } from "@/components/ui/Button";
import { CheckIcon, CopyIcon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/Toast";
import { ApiError, del, onUnauthorized, query } from "@/lib/client/http";
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

/**
 * Settings → Connected apps: the MCP connector URL with a copy button and the three steps to
 * add it in Claude, then every app the user has allowed, each with Disconnect (revokes its
 * tokens; it has to ask again to reconnect).
 */
export function ConnectedApps({ mcpUrl, apps: initial }: { mcpUrl: string; apps: ConnectedAppView[] }) {
  const toast = useToast();
  const router = useRouter();
  const [apps, setApps] = useState(initial);
  const [copied, setCopied] = useState(false);
  const [pending, setPending] = useState<string | null>(null);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(mcpUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.info("Copy the URL by hand", { body: mcpUrl });
    }
  };

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

  return (
    <>
      <div className={styles.intro}>
        <p className={ui.label}>Use PantherWatch from Claude</p>
        <p className={ui.description}>
          Let Claude, or another AI assistant that supports connectors, search classes, read your schedule and track
          sections for you. You choose what it&rsquo;s allowed to change.
        </p>
      </div>

      <div className={styles.urlRow}>
        <code className={styles.url} aria-label="Connector URL">
          {mcpUrl}
        </code>
        <Button variant="secondary" size="sm" onClick={copy} aria-live="polite">
          {copied ? <CheckIcon size={16} /> : <CopyIcon size={16} />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>

      <ol className={styles.steps}>
        <li>
          In Claude, open <strong>Settings → Connectors</strong>.
        </li>
        <li>
          Choose <strong>Add custom connector</strong> and paste the URL.
        </li>
        <li>
          On the PantherWatch page that opens, select <strong>Allow</strong>.
        </li>
      </ol>

      <div className={ui.divider} />

      <div className={styles.appsBlock}>
        <p className={ui.label}>Connected apps</p>
        {apps.length === 0 ? (
          <p className={ui.description}>
            No apps are connected. Apps you allow show up here, and you can disconnect them anytime.
          </p>
        ) : (
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
        )}
      </div>
    </>
  );
}
