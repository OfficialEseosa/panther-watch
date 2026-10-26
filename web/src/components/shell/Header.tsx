import { Suspense } from "react";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { AccountMenu, AccountMenuFallback } from "./AccountMenu";
import { Brand } from "./Brand";
import styles from "./Header.module.css";

/**
 * Top bar for < 900 px, in the original header's look: panther + "PantherWatch", the theme
 * toggle, and the account pill (or "Log in"). Sticky; the sidebar takes over at >= 900 px.
 * Navigation lives in the bottom nav (the redesign's, which the owner kept).
 */
export function Header() {
  return (
    <header className={styles.bar}>
      <div className={styles.left}>
        <Brand href="/dashboard" size={28} />
      </div>
      <div className={styles.right}>
        <ThemeToggle />
        <Suspense fallback={<AccountMenuFallback placement="topbar" />}>
          <AccountMenu placement="topbar" />
        </Suspense>
      </div>
    </header>
  );
}
