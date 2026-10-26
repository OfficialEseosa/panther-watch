import type { Metadata } from "next";
import { Brand } from "@/components/shell/Brand";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SearchIcon } from "@/components/ui/icons";
import styles from "./status.module.css";

export const metadata: Metadata = { title: "Page not found" };

/** Unmatched URLs (pages.md §10): minimal page outside the app shell. */
export default function NotFound() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Brand href="/" size={28} />
      </header>
      <main id="main" className={styles.main}>
        <EmptyState
          headingAs="h1"
          icon={<SearchIcon size={24} />}
          title="Page not found"
          actions={
            <>
              <ButtonLink href="/dashboard">Go to dashboard</ButtonLink>
              <ButtonLink href="/" variant="secondary">
                Home
              </ButtonLink>
            </>
          }
        >
          The page you&rsquo;re looking for doesn&rsquo;t exist or has moved.
        </EmptyState>
      </main>
    </div>
  );
}
