"use client";

import { useId } from "react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/ui/cn";
import { Spinner } from "./Spinner";
import { Tooltip, type TooltipPlacement } from "./Tooltip";
import styles from "./IconButton.module.css";

export type IconButtonProps = Omit<ComponentProps<"button">, "children" | "aria-label"> & {
  /** Accessible name. Required; also the default tooltip text. */
  label: string;
  /** The icon, e.g. `<XIcon />`. Sized by the button (16 for sm, 20 for md). */
  icon: ReactNode;
  variant?: "ghost" | "outline" | "danger-ghost";
  size?: "sm" | "md";
  /** Toggle form: sets aria-pressed and the pressed (accent-subtle) styling. */
  pressed?: boolean;
  /** Tooltip text. Defaults to `label`; pass `false` to disable. */
  tooltip?: string | false;
  tooltipPlacement?: TooltipPlacement;
  loading?: boolean;
};

/** Square icon-only button (spec.md §2.2). */
export function IconButton({
  label,
  icon,
  variant = "ghost",
  size = "md",
  pressed,
  tooltip,
  tooltipPlacement,
  loading = false,
  className,
  type = "button",
  onClick,
  ...rest
}: IconButtonProps) {
  const tipId = useId();
  const tipText = tooltip === undefined ? label : tooltip;
  const describes = tipText !== false && tipText !== label;

  const button = (
    <button
      type={type}
      aria-label={label}
      aria-pressed={pressed}
      aria-busy={loading || undefined}
      aria-describedby={describes ? tipId : undefined}
      className={cn(styles.button, styles[variant], styles[size], className)}
      onClick={loading ? (event) => event.preventDefault() : onClick}
      {...rest}
    >
      {loading ? <Spinner size={size === "sm" ? 14 : 16} /> : icon}
    </button>
  );

  if (tipText === false) return button;
  return (
    <Tooltip content={tipText} placement={tooltipPlacement} id={tipId}>
      {button}
    </Tooltip>
  );
}
