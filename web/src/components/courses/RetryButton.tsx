"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { ReactNode } from "react";
import { cn } from "@/lib/ui/cn";
import buttons from "./buttons.module.css";

/** Re-runs the page's server components (router.refresh), in the original button style. */
export function RetryButton({
  children = "Try again",
  variant = "primary",
  className,
}: {
  children?: ReactNode;
  variant?: "primary" | "secondary";
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      className={cn(buttons[variant], className)}
      aria-busy={pending || undefined}
      onClick={() => startTransition(() => router.refresh())}
    >
      {pending ? "Loading…" : children}
    </button>
  );
}
