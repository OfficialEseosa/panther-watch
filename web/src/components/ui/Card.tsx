import Link from "next/link";
import type { ComponentProps, ElementType, ReactNode } from "react";
import { cn } from "@/lib/ui/cn";
import styles from "./Card.module.css";

export type CardProps = {
  /** Element to render. Defaults to <section> when `title` is set, else <div>. */
  as?: ElementType;
  /** Optional header row (title + actions); separated by a 1 px rule. */
  header?: ReactNode;
  /** Shorthand for a header with a heading. */
  title?: ReactNode;
  /** Heading level used for `title`. Default h2. */
  titleAs?: "h2" | "h3" | "h4";
  /** Actions placed at the right of the title row. */
  actions?: ReactNode;
  footer?: ReactNode;
  /**
   * Interactive card (stretched-link pattern, spec.md §2.5): hover lift, press settle and focus
   * ring on the card. Put a <CardLink> (or an element with the `stretchedLink` class) inside.
   */
  interactive?: boolean;
  /** Remove body padding (e.g. edge-to-edge lists). */
  flush?: boolean;
  className?: string;
  bodyClassName?: string;
  children?: ReactNode;
} & Omit<ComponentProps<"div">, "title">;

/** Container (spec.md §2.5). Cards don't nest cards. */
export function Card({
  as,
  header,
  title,
  titleAs: Heading = "h2",
  actions,
  footer,
  interactive = false,
  flush = false,
  className,
  bodyClassName,
  children,
  ...rest
}: CardProps) {
  const Element: ElementType = as ?? (title ? "section" : "div");
  const head =
    header ??
    (title || actions ? (
      <div className={styles.titleRow}>
        {title ? <Heading className={styles.title}>{title}</Heading> : <span />}
        {actions ? <div className={styles.actions}>{actions}</div> : null}
      </div>
    ) : null);

  return (
    <Element className={cn(styles.card, interactive && styles.interactive, className)} {...rest}>
      {head ? <div className={styles.header}>{head}</div> : null}
      <div className={cn(styles.body, flush && styles.flush, bodyClassName)}>{children}</div>
      {footer ? <div className={styles.footer}>{footer}</div> : null}
    </Element>
  );
}

/** The stretched primary link of an interactive Card: its ::after covers the whole card. */
export function CardLink({ className, ...rest }: ComponentProps<typeof Link>) {
  return <Link className={cn(styles.stretchedLink, className)} {...rest} />;
}

/** Class for a custom stretched link/button, and for secondary controls raised above it. */
export const cardClasses = {
  stretchedLink: styles.stretchedLink,
  raised: styles.raised,
};
