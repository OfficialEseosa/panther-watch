"use client";

import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { useViewer } from "@/components/shell/ViewerContext";
import { ChatIcon, PlugIcon } from "@/components/ui/icons";
import { Tabs, TabsPlaceholder } from "@/components/ui/Tabs";
import styles from "./AssistantTabs.module.css";

export type AssistantTab = "chat" | "connect";

const isTab = (value: string | null): value is AssistantTab => value === "chat" || value === "connect";

const LABELS = [
  { id: "chat", label: "Chat", icon: <ChatIcon /> },
  { id: "connect", label: "Connect", icon: <PlugIcon /> },
] as const;

/**
 * /assistant's two page-level tabs under the header: Chat (the on-page assistant) and Connect
 * (using PantherWatch from Claude, ChatGPT and the rest). The tab lives in the URL (?tab=connect)
 * so links can open either one; without it, members start on Chat and guests on Connect (the chat
 * needs an account, so a guest's first view isn't a sign-in wall). Both panels stay mounted (the
 * inactive one `hidden`) so the Connect content is always in the server HTML.
 *
 * Reads the URL and the viewer, so it renders per request: wrap it in <Suspense> with
 * <AssistantTabsFallback /> to keep the rest of the page in the static shell.
 */
export function AssistantTabs({ chat, connect }: { chat: ReactNode; connect: ReactNode }) {
  const { user } = useViewer();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const fallback: AssistantTab = user ? "chat" : "connect";
  const param = searchParams.get("tab");
  const selected = isTab(param) ? param : fallback;

  const select = (id: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (id === fallback) params.delete("tab");
    else params.set("tab", id);
    const query = params.toString();
    // Next.js syncs useSearchParams with history.replaceState: the tab switches without a request.
    window.history.replaceState(null, "", `${pathname}${query ? `?${query}` : ""}${window.location.hash}`);
  };

  return (
    <Tabs
      label="AI Assistant"
      size="lg"
      keepMounted
      value={selected}
      onValueChange={select}
      panelClassName={styles.panel}
      tabs={[
        { ...LABELS[0], panel: chat },
        { ...LABELS[1], panel: connect },
      ]}
    />
  );
}

/** The strip with nothing selected, while the request decides which tab opens. */
export function AssistantTabsFallback({ children }: { children?: ReactNode }) {
  return (
    <>
      <TabsPlaceholder tabs={[...LABELS]} size="lg" />
      <div className={styles.panel}>{children}</div>
    </>
  );
}
