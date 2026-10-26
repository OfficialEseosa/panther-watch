import Link from "next/link";
import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { ChevronLeftIcon } from "@/components/ui/icons";
import { Brand } from "./Brand";
import { SiteFooter } from "./SiteFooter";
import { SkipLink } from "./SkipLink";
import styles from "./LegalLayout.module.css";

export const LEGAL_LAST_UPDATED = "October 25, 2026";
/** Owner's chosen contact address (audit: intentional). */
export const LEGAL_CONTACT_EMAIL = "raphaelomorose@gmail.com";

export type LegalSectionEntry = { id: string; title: string };

export type LegalLayoutProps = {
  title: string;
  /** The page's sections (ids match LegalSection). Kept for callers; the original layout has no TOC. */
  sections: LegalSectionEntry[];
  /** Intro paragraph(s) before the first section. */
  intro?: ReactNode;
  children: ReactNode;
};

/**
 * Shared chrome for /privacy and /terms, as in the original app (old Legal.css): a slim header
 * with the brand and theme toggle, one 820 px column with a Back link, the document, cross
 * links, and a centered footer. Fully static.
 */
export function LegalLayout({ title, intro, children }: LegalLayoutProps) {
  return (
    <div className={styles.page}>
      <SkipLink />
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Brand href="/" size={28} />
          <ThemeToggle />
        </div>
      </header>

      <main id="main" tabIndex={-1} className={styles.main}>
        <Link href="/" className={styles.back}>
          <ChevronLeftIcon size={16} />
          Back
        </Link>
        <article className={styles.article}>
          <h1 className={styles.title}>{title}</h1>
          <p className={styles.updated}>Last updated {LEGAL_LAST_UPDATED}</p>
          {intro ? <div className={styles.intro}>{intro}</div> : null}
          {children}
        </article>
        <nav aria-label="Legal documents" className={styles.cross}>
          <Link href="/privacy">Privacy Policy</Link>
          <span aria-hidden="true">·</span>
          <Link href="/terms">Terms of Service</Link>
        </nav>
      </main>

      <SiteFooter className={styles.footer} />
    </div>
  );
}

/** One h2 section of a legal page. */
export function LegalSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className={styles.section}>
      <h2 id={id} className={styles.h2}>
        {title}
      </h2>
      {children}
    </section>
  );
}
