import type { Metadata } from "next";
import { Suspense } from "react";
import { EmailComposer } from "@/components/admin/EmailComposer";
import { ListSkeleton } from "@/components/admin/ListSkeleton";
import { settle } from "@/components/admin/LoadError";
import { loadStats } from "@/components/admin/server";
import styles from "@/components/admin/admin.module.css";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Email · Admin" };

export default function AdminEmailPage() {
  return (
    <Suspense fallback={<ListSkeleton label="Loading the composer" rows={3} />}>
      <Composer />
    </Suspense>
  );
}

async function Composer() {
  // The budget is a hint: if stats fail, the composer still works.
  const result = await settle(loadStats());
  const stats = result.ok ? result.data : null;
  return (
    <div className={styles.section}>
      <p className={styles.prose}>
        Send a one-off email to any address. It goes out through Resend inside the PantherWatch layout, counts
        against the shared daily limit, and is logged. To email a specific user, use their menu on the Users tab.
      </p>
      <EmailComposer appUrl={env.APP_URL} dailyRemaining={stats?.emailBudget.dailyRemaining ?? null} />
    </div>
  );
}
