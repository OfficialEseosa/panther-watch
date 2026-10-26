"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { BookmarkIcon, CalendarCheckIcon, CalendarIcon, ChevronLeftIcon, ChevronRightIcon, MailIcon, SearchIcon, UsersIcon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/Toast";
import { adminApi, type AdminUser, type UserPage } from "@/lib/client/admin";
import { ApiError, errorMessage, onUnauthorized } from "@/lib/client/http";
import { cn } from "@/lib/ui/cn";
import { EmailComposer } from "./EmailComposer";
import { formatDate, pageRange } from "./format";
import { createSequence } from "./sequence";
import styles from "./admin.module.css";
import { formatNumber, plural } from "@/lib/format";

const DEBOUNCE_MS = 300;

export type UsersPanelProps = {
  initialQuery: string;
  initialPage: UserPage;
  pageSize: number;
  dailyRemaining: number | null;
};

/**
 * Users tab: the old "User management" section (UserSearchSection.jsx) with its search box and
 * user cards, minus the dead select-all. The search is debounced (300 ms), sequence-guarded and
 * mirrored to ?q=; long lists page by offset. "Send email" opens the composer.
 */
export function UsersPanel({ initialQuery, initialPage, pageSize, dailyRemaining }: UsersPanelProps) {
  const toast = useToast();
  const [query, setQuery] = useState(initialQuery);
  const [page, setPage] = useState(initialPage);
  /** The query `page` was loaded for: paging stays on it even while a new search is debouncing. */
  const [shownQuery, setShownQuery] = useState(initialQuery.trim());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailing, setEmailing] = useState<AdminUser | null>(null);
  const [emailOpen, setEmailOpen] = useState(false);
  const [remaining, setRemaining] = useState(dailyRemaining);
  const seq = useRef(createSequence());
  const abort = useRef<AbortController | null>(null);
  const lastKey = useRef(`${initialQuery.trim()}|0`);
  const listRef = useRef<HTMLUListElement>(null);

  const load = async (q: string, offset: number) => {
    const key = `${q.trim()}|${offset}`;
    lastKey.current = key;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    const ticket = seq.current.next();
    setLoading(true);
    try {
      const next = await adminApi.users({ q, limit: pageSize, offset }, controller.signal);
      if (!seq.current.isLatest(ticket)) return;
      setPage(next);
      setShownQuery(q.trim());
      setError(null);
    } catch (caught) {
      if (!seq.current.isLatest(ticket) || controller.signal.aborted) return;
      if (caught instanceof ApiError && caught.status === 401) onUnauthorized(toast);
      setError(errorMessage(caught, "Couldn't reach the server."));
    } finally {
      if (seq.current.isLatest(ticket)) setLoading(false);
    }
  };

  // Debounced search; mirrored to ?q= without a navigation.
  useEffect(() => {
    const q = query.trim();
    if (`${q}|0` === lastKey.current) return;
    const timer = window.setTimeout(() => {
      const url = new URL(window.location.href);
      if (q) url.searchParams.set("q", q);
      else url.searchParams.delete("q");
      window.history.replaceState(window.history.state, "", url);
      void load(q, 0);
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load is recreated per render; query drives this
  }, [query]);

  useEffect(() => {
    const sequence = seq.current;
    return () => {
      sequence.cancel();
      abort.current?.abort();
    };
  }, []);

  const goTo = (offset: number) => {
    void load(shownQuery, offset).then(() => listRef.current?.scrollIntoView({ block: "nearest" }));
  };

  const q = query.trim();
  const hasPrev = page.offset > 0;
  const hasNext = page.offset + page.users.length < page.total;

  return (
    <section className={styles.section} aria-labelledby="admin-user-management">
      <h2 id="admin-user-management" className={styles.sectionHeading}>
        <UsersIcon size={20} />
        User management
      </h2>

      <label className={styles.searchBox}>
        <span className="sr-only">Search users by name or email</span>
        <input
          type="search"
          className={styles.searchInput}
          placeholder="Search by name or email"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
        <SearchIcon size={16} className={styles.searchIcon} />
      </label>
      <p className={styles.muted} aria-live="polite">
        {loading ? "Searching…" : q ? plural(page.total, "match", "matches") : plural(page.total, "user")}
      </p>

      {error ? (
        <div className={styles.notice} data-tone="danger" role="alert">
          {error}{" "}
          <button type="button" className={cn(styles.btn, styles.btnSecondary, styles.btnSmall)} onClick={() => void load(query, page.offset)}>
            Try again
          </button>
        </div>
      ) : page.users.length === 0 ? (
        <div className={styles.noUsers} role="status">
          <SearchIcon size={32} />
          <p>{q ? `No users match “${q}”.` : "No users found"}</p>
          {q ? <p>Try a different search term.</p> : null}
        </div>
      ) : (
        <ul ref={listRef} className={styles.usersGrid} aria-label="Users" aria-busy={loading || undefined}>
          {page.users.map((user) => (
            <UserCard
              key={user.id}
              user={user}
              onSendEmail={() => {
                setEmailing(user);
                setEmailOpen(true);
              }}
            />
          ))}
        </ul>
      )}

      {page.total > pageSize ? (
        <nav className={styles.pager} aria-label="Users pages">
          <span className={styles.muted}>{pageRange(page.offset, page.users.length, page.total)}</span>
          <div className={styles.pagerButtons}>
            <button
              type="button"
              className={cn(styles.btn, styles.btnSecondary, styles.btnSmall)}
              disabled={!hasPrev || loading}
              onClick={() => goTo(Math.max(0, page.offset - pageSize))}
            >
              <ChevronLeftIcon />
              Previous
            </button>
            <button
              type="button"
              className={cn(styles.btn, styles.btnSecondary, styles.btnSmall)}
              disabled={!hasNext || loading}
              onClick={() => goTo(page.offset + pageSize)}
            >
              Next
              <ChevronRightIcon />
            </button>
          </div>
        </nav>
      ) : null}

      <Dialog open={emailOpen} onClose={() => setEmailOpen(false)} title="Compose email" size="md">
        {emailing ? (
          <EmailComposer
            key={emailing.id}
            layout="dialog"
            dailyRemaining={remaining}
            recipient={{ email: emailing.email, name: emailing.name, pictureUrl: emailing.pictureUrl }}
            onCancel={() => setEmailOpen(false)}
            onSent={() => {
              setEmailOpen(false);
              setRemaining((n) => (n == null ? n : Math.max(0, n - 1)));
            }}
          />
        ) : null}
      </Dialog>
    </section>
  );
}

/** One user card (old UserCard.jsx, without the selection checkbox). */
function UserCard({ user, onSendEmail }: { user: AdminUser; onSendEmail: () => void }) {
  const name = user.name || user.email.split("@")[0];
  return (
    <li className={styles.userCard}>
      <div className={styles.userCardHeader}>
        <UserAvatar src={user.pictureUrl} name={user.name || user.email} />
        <div className={styles.userInfo}>
          <h3 className={styles.userName}>{name}</h3>
          <p className={styles.userEmail}>{user.email}</p>
        </div>
      </div>
      <dl className={styles.userStats}>
        <div className={styles.statItem}>
          <dt className="sr-only">Tracked classes</dt>
          <BookmarkIcon size={14} />
          <dd>{plural(user.watchCount, "tracked class", "tracked classes")}</dd>
        </div>
        <div className={styles.statItem}>
          <dt className="sr-only">Scheduled classes</dt>
          <CalendarCheckIcon size={14} />
          <dd>{formatNumber(user.scheduleCount)} on schedule</dd>
        </div>
        <div className={styles.statItem}>
          <dt className="sr-only">Joined</dt>
          <CalendarIcon size={14} />
          <dd>
            Joined <time dateTime={user.createdAt}>{formatDate(user.createdAt)}</time>
          </dd>
        </div>
      </dl>
      <div className={styles.userActions}>
        <button type="button" className={cn(styles.btn, styles.btnSend)} onClick={onSendEmail}>
          <MailIcon />
          Send email
          <span className="sr-only"> to {name}</span>
        </button>
      </div>
    </li>
  );
}

function UserAvatar({ src, name }: { src: string | null; name: string }) {
  const [broken, setBroken] = useState(false);
  return (
    <div className={styles.avatar} aria-hidden="true">
      {src && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote Google avatars, tiny and decorative
        <img src={src} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
      ) : (
        name.charAt(0).toUpperCase()
      )}
    </div>
  );
}

/** Users tab loading state. */
export function UsersSkeleton() {
  return (
    <section className={styles.section}>
      <p className={styles.loading} role="status">
        Loading users…
      </p>
    </section>
  );
}
