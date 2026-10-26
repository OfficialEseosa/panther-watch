"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { useToast } from "@/components/ui/Toast";

/**
 * Sign out: POST /api/auth/logout (same-origin fetch sends Origin, which the route checks), then
 * go to "/" and refresh server components so the shell renders the guest view. No full reload.
 */
export function useSignOut() {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);

  const signOut = useCallback(async () => {
    setPending(true);
    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
        redirect: "manual",
      });
      // The route answers 303 -> "/"; with redirect: "manual" that is an opaque redirect.
      if (!response.ok && response.type !== "opaqueredirect") throw new Error(`logout ${response.status}`);
      router.replace("/");
      router.refresh();
    } catch {
      toast.error("Couldn't sign out", { body: "Check your connection and try again." });
    } finally {
      setPending(false);
    }
  }, [router, toast]);

  return { signOut, pending };
}
