import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadError, settle } from "@/components/admin/LoadError";
import { loadStats, loadUsers, USERS_PAGE_SIZE } from "@/components/admin/server";
import { UsersPanel, UsersSkeleton } from "@/components/admin/UsersPanel";

export const metadata: Metadata = { title: "Users · Admin" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function AdminUsersPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<UsersSkeleton />}>
      <Users searchParams={searchParams} />
    </Suspense>
  );
}

async function Users({ searchParams }: { searchParams: SearchParams }) {
  const raw = (await searchParams).q;
  const q = (Array.isArray(raw) ? raw[0] : raw)?.trim().slice(0, 200) ?? "";
  const [users, stats] = await Promise.all([
    settle(loadUsers(q || undefined)),
    // The composer shows the daily budget; a stats failure must not hide the users list.
    settle(loadStats()),
  ]);
  if (!users.ok) return <LoadError what="users" />;
  return (
    <UsersPanel
      initialQuery={q}
      initialPage={users.data}
      pageSize={USERS_PAGE_SIZE}
      dailyRemaining={stats.ok ? stats.data.emailBudget.dailyRemaining : null}
    />
  );
}
