"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { DASHBOARD_KEYS, useStoredFlag } from "./useStoredFlag";

/** Bump to show the showcase again to everyone who has seen the previous one. */
const WHATS_NEW_VERSION = "v3";

// The showcase (and its CSS) loads only when it is actually going to open.
const WhatsNewShowcase = dynamic(() => import("./WhatsNewShowcase"), { ssr: false });

const subscribeNoop = () => () => {};
const readForced = () => new URLSearchParams(window.location.search).get("whatsnew") === "1";

/**
 * Opens the "What's new" showcase once per version for signed-in visitors (remembered in
 * localStorage as `pantherwatch.whatsNew.v3`), or any time the URL has `?whatsnew=1` (the admin
 * preview link). Renders nothing during SSR and hydration.
 */
export function WhatsNewLauncher({ member }: { member: boolean }) {
  const router = useRouter();
  const [seen, setSeen] = useStoredFlag(DASHBOARD_KEYS.whatsNew(WHATS_NEW_VERSION));
  const forced = useSyncExternalStore(subscribeNoop, readForced, () => false);
  const [closed, setClosed] = useState(false);

  const open = !closed && (forced || (member && seen === false));
  if (!open) return null;

  return (
    <WhatsNewShowcase
      onClose={() => {
        setClosed(true);
        if (member) setSeen(true);
        if (forced) router.replace("/dashboard", { scroll: false });
      }}
    />
  );
}
