import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminLoading } from "@/components/admin/AdminFrame";
import { EmailComposer } from "@/components/admin/EmailComposer";
import { settle } from "@/components/admin/LoadError";
import { SampleAlertCard } from "@/components/admin/SampleAlertCard";
import { loadStats } from "@/components/admin/server";
import { MailIcon } from "@/components/ui/icons";
import styles from "@/components/admin/admin.module.css";

export const metadata: Metadata = { title: "Email · Admin" };

export default function AdminEmailPage() {
  return (
    <Suspense fallback={<AdminLoading label="Loading the composer…" />}>
      <Composer />
    </Suspense>
  );
}

async function Composer() {
  // The budget is a hint: if stats fail, the composer still works.
  const result = await settle(loadStats());
  const stats = result.ok ? result.data : null;
  return (
    <section className={styles.section} aria-labelledby="admin-email-title">
      <h2 id="admin-email-title" className={styles.sectionHeading}>
        <MailIcon size={22} />
        Compose email
      </h2>
      <p className={styles.muted}>
        Send a one-off email to any address. It goes out in the PantherWatch layout, counts against the shared daily
        limit, and is logged. To email a specific user, use Send email on their card in Users.
      </p>
      <EmailComposer dailyRemaining={stats?.emailBudget.dailyRemaining ?? null} />
      <SampleAlertCard />
    </section>
  );
}
