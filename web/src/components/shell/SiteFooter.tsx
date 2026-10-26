import Link from "next/link";
import { Suspense } from "react";
import { cn } from "@/lib/ui/cn";
import styles from "./SiteFooter.module.css";

async function CopyrightYear() {
  "use cache";
  // Cached at build/revalidation time: Cache Components forbids reading the clock while
  // prerendering otherwise. A deploy each year keeps it current.
  return <>{new Date().getFullYear()}</>;
}

/** Footer for the landing and legal pages. */
export function SiteFooter({ className }: { className?: string }) {
  return (
    <footer className={cn(styles.footer, className)}>
      <div className={styles.inner}>
        <p>
          © <Suspense fallback="2026">
            <CopyrightYear />
          </Suspense>{" "}
          PantherWatch. Not affiliated with Georgia State University.
        </p>
        <nav aria-label="Legal" className={styles.links}>
          <Link href="/privacy">Privacy Policy</Link>
          <span aria-hidden="true">·</span>
          <Link href="/terms">Terms of Service</Link>
        </nav>
      </div>
    </footer>
  );
}
