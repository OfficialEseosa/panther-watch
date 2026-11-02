"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { Button, ButtonAnchor } from "@/components/ui/Button";
import { CheckIcon, CopyIcon, ExternalIcon, PlugIcon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/Toast";
import styles from "./ConnectButtons.module.css";

/**
 * One-click setup for /assistant. Only the apps with a documented install link get a button
 * (checked 2026-11-01):
 *
 * - Cursor: `cursor://anysphere.cursor-deeplink/mcp/install?name=<name>&config=<base64 JSON>`,
 *   the config being an mcp.json server entry (cursor.com/docs/context/mcp/install-links).
 * - VS Code: `vscode:mcp/install?<URL-encoded JSON>` with `name` + the server config, and the
 *   `vscode-insiders:` twin (code.visualstudio.com/api/extension-guides/ai/mcp).
 * - Claude Code: a CLI command, `claude mcp add --transport http <name> <url>` (code.claude.com/docs/en/mcp).
 *
 * Claude and ChatGPT have no link that pre-fills a custom connector, so those steps only link
 * to the right settings screen (SettingsLink). All links are plain anchors: they work before
 * hydration and without JavaScript. `mcpUrl` comes from the page (APP_URL), so local and preview
 * deployments link to themselves.
 */

/** The server's key in each app's config, and the name the Claude Code command registers. */
export const SERVER_NAME = "pantherwatch";

export function cursorInstallHref(mcpUrl: string): string {
  const config = btoa(JSON.stringify({ url: mcpUrl }));
  return `cursor://anysphere.cursor-deeplink/mcp/install?name=${SERVER_NAME}&config=${encodeURIComponent(config)}`;
}

export function vscodeInstallHref(mcpUrl: string, insiders = false): string {
  const config = { name: SERVER_NAME, type: "http", url: mcpUrl };
  return `${insiders ? "vscode-insiders" : "vscode"}:mcp/install?${encodeURIComponent(JSON.stringify(config))}`;
}

export function claudeCodeCommand(mcpUrl: string): string {
  return `claude mcp add --transport http ${SERVER_NAME} ${mcpUrl}`;
}

/** "Add to Cursor" / "Add to VS Code" (+ Insiders): opens the app's own install prompt. */
export function ConnectButtons({ app, mcpUrl }: { app: "cursor" | "vscode"; mcpUrl: string }) {
  if (app === "cursor") {
    return (
      <div className={styles.row}>
        <ButtonAnchor href={cursorInstallHref(mcpUrl)} leadingIcon={<PlugIcon />}>
          Add to Cursor
        </ButtonAnchor>
      </div>
    );
  }
  return (
    <div className={styles.row}>
      <ButtonAnchor href={vscodeInstallHref(mcpUrl)} leadingIcon={<PlugIcon />}>
        Add to VS Code
      </ButtonAnchor>
      <ButtonAnchor href={vscodeInstallHref(mcpUrl, true)} variant="secondary">
        VS Code Insiders
      </ButtonAnchor>
    </div>
  );
}

/** A link to an assistant's settings screen, in a new tab (the user comes back here for the URL). */
export function SettingsLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <span className={styles.row}>
      <ButtonAnchor
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        variant="secondary"
        size="sm"
        trailingIcon={<ExternalIcon size={16} />}
      >
        {children}
      </ButtonAnchor>
    </span>
  );
}

/** The Claude Code command for this deployment's URL, with Copy. */
export function ClaudeCodeCommand({ mcpUrl }: { mcpUrl: string }) {
  return <CommandCopy command={claudeCodeCommand(mcpUrl)} />;
}

/** A shell command with Copy ("Copied!" for 2 s), styled like the connector URL row. */
function CommandCopy({ command }: { command: string }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.info("Copy the command by hand", { body: command });
    }
  };

  return (
    <div className={styles.commandRow}>
      <code className={styles.command} aria-label="Command">
        {command}
      </code>
      <Button
        variant="secondary"
        size="sm"
        onClick={copy}
        aria-live="polite"
        aria-label={copied ? "Copied command" : "Copy command"}
        leadingIcon={copied ? <CheckIcon size={16} /> : <CopyIcon size={16} />}
      >
        {copied ? "Copied!" : "Copy"}
      </Button>
    </div>
  );
}
