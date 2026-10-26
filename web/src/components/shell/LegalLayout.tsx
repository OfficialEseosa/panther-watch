import Link from "next/link";
import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { Brand } from "./Brand";
import { LegalToc } from "./LegalToc";
import { SiteFooter } from "./SiteFooter";
import { SkipLink } from "./SkipLink";
import styles from "./LegalLayout.module.css";

export const LEGAL_LAST_UPDATED = "October 25, 2026";
/** Owner's chosen contact address (audit: intentional). */
export const LEGAL_CONTACT_EMAIL = "raphaelomorose@gmail.com";

export type LegalSectionEntry = { id: string; title: string };

export type LegalLayoutProps = {
  title: string;
  /** Sections for the table of contents (>= 1200 px). Must match LegalSection ids. */
  sections: LegalSectionEntry[];
  /** Intro paragraph(s) before the first section. */
  intro?: ReactNode;
  children: ReactNode;
};

/**
 * Shared chrome for /privacy and /terms (pages.md §9): minimal header, 72ch article, sticky
 * table of contents at >= 1200 px, landing footer. Fully static.
 */
export function LegalLayout({ title, sections, intro, children }: LegalLayoutProps) {
  return (
    <div className={styles.page}>
      <SkipLink />
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Brand href="/" size={28} />
          <ThemeToggle />
        </div>
      </header>

      <div className={styles.layout}>
        <aside className={styles.tocColumn}>
          <LegalToc sections={sections} />
        </aside>
        <main id="main" tabIndex={-1} className={styles.main}>
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
      </div>

      <SiteFooter />
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
