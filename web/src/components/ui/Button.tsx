import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/ui/cn";
import { Spinner } from "./Spinner";
import styles from "./Button.module.css";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "danger-ghost";
export type ButtonSize = "sm" | "md" | "lg";

type StyleProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Full width (use only where pages.md says so, usually mobile). */
  fullWidth?: boolean;
  /** Icon element before the label, e.g. `<PlusIcon />`. Sized by the button. */
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
};

/** Class names for a Button look-alike (e.g. on a non-Next anchor or a <label>). */
export function buttonClassName({
  variant = "primary",
  size = "md",
  fullWidth = false,
  className,
}: { variant?: ButtonVariant; size?: ButtonSize; fullWidth?: boolean; className?: string } = {}) {
  return cn(styles.button, styles[variant], styles[size], fullWidth && styles.fullWidth, className);
}

export type ButtonProps = ComponentProps<"button"> &
  StyleProps & {
    /** Shows a spinner in place of the leading icon, sets aria-busy and ignores clicks. */
    loading?: boolean;
  };

/** Button (spec.md §2.1). The label is required; use IconButton when there is none. */
export function Button({
  variant,
  size,
  fullWidth,
  leadingIcon,
  trailingIcon,
  loading = false,
  className,
  children,
  type = "button",
  onClick,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClassName({ variant, size, fullWidth, className })}
      aria-busy={loading || undefined}
      onClick={loading ? (event) => event.preventDefault() : onClick}
      {...rest}
    >
      {loading ? <Spinner /> : leadingIcon}
      <span className={styles.label}>{children}</span>
      {trailingIcon}
    </button>
  );
}

export type ButtonLinkProps = ComponentProps<typeof Link> & StyleProps;

/** A next/link that looks like a Button. For app routes. */
export function ButtonLink({
  variant,
  size,
  fullWidth,
  leadingIcon,
  trailingIcon,
  className,
  children,
  ...rest
}: ButtonLinkProps) {
  return (
    <Link className={buttonClassName({ variant, size, fullWidth, className })} {...rest}>
      {leadingIcon}
      <span className={styles.label}>{children}</span>
      {trailingIcon}
    </Link>
  );
}

export type ButtonAnchorProps = ComponentProps<"a"> & StyleProps & { href: string };

/**
 * A plain <a> that looks like a Button: route handlers (e.g. /api/auth/google/login, which must
 * not be prefetched or client-routed), external URLs and downloads.
 */
export function ButtonAnchor({
  variant,
  size,
  fullWidth,
  leadingIcon,
  trailingIcon,
  className,
  children,
  ...rest
}: ButtonAnchorProps) {
  return (
    <a className={buttonClassName({ variant, size, fullWidth, className })} {...rest}>
      {leadingIcon}
      <span className={styles.label}>{children}</span>
      {trailingIcon}
    </a>
  );
}
