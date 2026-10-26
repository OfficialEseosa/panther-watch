"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button, type ButtonProps } from "@/components/ui/Button";
import { RefreshIcon } from "@/components/ui/icons";

/** Re-runs the page's server components (router.refresh), with a pending state. */
export function RetryButton({ children = "Try again", size = "md", variant, ...rest }: Omit<ButtonProps, "onClick" | "loading">) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size={size}
      variant={variant}
      leadingIcon={<RefreshIcon />}
      loading={pending}
      onClick={() => startTransition(() => router.refresh())}
      {...rest}
    >
      {children}
    </Button>
  );
}
