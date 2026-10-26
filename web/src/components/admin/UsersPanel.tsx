"use client";

import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { ChevronLeftIcon, ChevronRightIcon, CopyIcon, MailIcon, MoreIcon, SearchIcon } from "@/components/ui/icons";
import { Input } from "@/components/ui/Input";
import { Menu, MenuItem } from "@/components/ui/Menu";
import { Skeleton, SkeletonGroup } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { adminApi, type AdminUser, type UserPage } from "@/lib/client/admin";
import { ApiError, errorMessage, onUnauthorized } from "@/lib/client/http";
import { EmailComposer } from "./EmailComposer";
import { formatDate, pageRange } from "./format";
import { createSequence } from "./sequence";
import styles from "./admin.module.css";
import menuStyles from "./UsersPanel.module.css";
import { formatNumber, plural } from "@/lib/format";

const DEBOUNCE_MS = 300;

export type UsersPanelProps = {
  initialQuery: string;
  initialPage: UserPage;
  pageSize: number;
  appUrl: string;
  dailyRemaining: number | null;
};

/**
 * Users tab (pages.md §8.2): debounced (300 ms), sequence-guarded search mirrored to ?q=,
 * offset pagination, and a per-user menu to email (composer Dialog) or copy the address.
 * The old dead "select all" is gone.
 */
export function UsersPanel({ initialQuery, initialPage, pageSize, appUrl, dailyRemaining }: UsersPanelProps) {
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

  const copy = async (email: string) => {
    try {
      await navigator.clipboard.writeText(email);
      toast.success("Email copied");
    } catch {
      toast.error("Couldn't copy", { body: "Your browser blocked clipboard access." });
    }
  };

  const q = query.trim();
  const hasPrev = page.offset > 0;
  const hasNext = page.offset + page.users.length < page.total;

  return (
    <div className={styles.stack}>
      <div className={styles.section}>
        <div className={styles.toolbar}>
          <div className={styles.search}>
            <Input
              type="search"
              leadingIcon={<SearchIcon size={16} />}
              placeholder="Search by name or email"
              aria-label="Search users by name or email"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <p className={styles.muted} aria-live="polite">
            {loading ? "Searching…" : q ? plural(page.total, "match", "matches") : plural(page.total, "user")}
          </p>
        </div>

        {error ? (
          <EmptyState
            variant="error"
            title="Couldn't load users"
            actions={
              <Button variant="secondary" onClick={() => void load(query, page.offset)}>
                Try again
              </Button>
            }
          >
            {error}
          </EmptyState>
        ) : page.users.length === 0 ? (
          <EmptyState variant="no-results" icon={<SearchIcon size={24} />} title={q ? `No users match “${q}”.` : "No users yet."} />
        ) : (
          <ul ref={listRef} className={styles.list} aria-label="Users" aria-busy={loading || undefined} data-loading={loading || undefined}>
            {page.users.map((user) => (
              <li key={user.id} className={styles.row}>
                <div className={styles.rowMain}>
                  <Avatar src={user.pictureUrl} name={user.name ?? user.email} size={32} />
                  <div className={styles.rowText}>
                    <span className={styles.rowTitle}>{user.name || user.email.split("@")[0]}</span>
                    <span className={styles.rowSub}>{user.email}</span>
                  </div>
                </div>
                <div className={styles.rowMeta}>
                  <Badge tone={user.watchCount > 0 ? "accent" : "neutral"}>{formatNumber(user.watchCount)} tracked</Badge>
                  <Badge>{formatNumber(user.scheduleCount)} scheduled</Badge>
                  <span>
                    Joined <time dateTime={user.createdAt}>{formatDate(user.createdAt)}</time>
                  </span>
                </div>
                <div className={styles.rowActions}>
                  <Menu
                    trigger={<MoreIcon />}
                    triggerLabel={`Actions for ${user.name || user.email}`}
                    triggerClassName={menuStyles.trigger}
                    label={`Actions for ${user.name || user.email}`}
                  >
                    <MenuItem icon={<MailIcon size={16} />} onSelect={() => {
                        setEmailing(user);
                        setEmailOpen(true);
                      }}
                    >
                      Email user…
                    </MenuItem>
                    <MenuItem icon={<CopyIcon size={16} />} onSelect={() => void copy(user.email)}>
                      Copy email
                    </MenuItem>
                  </Menu>
                </div>
              </li>
            ))}
          </ul>
        )}

        {page.total > pageSize ? (
          <nav className={styles.pager} aria-label="Users pages">
            <span className={styles.muted}>{pageRange(page.offset, page.users.length, page.total)}</span>
            <div className={styles.pagerButtons}>
              <Button
                variant="secondary"
                size="sm"
                leadingIcon={<ChevronLeftIcon />}
                disabled={!hasPrev || loading}
                onClick={() => goTo(Math.max(0, page.offset - pageSize))}
              >
                Previous
              </Button>
              <Button
                variant="secondary"
                size="sm"
                trailingIcon={<ChevronRightIcon />}
                disabled={!hasNext || loading}
                onClick={() => goTo(page.offset + pageSize)}
              >
                Next
              </Button>
            </div>
          </nav>
        ) : null}
      </div>

      <Dialog open={emailOpen} onClose={() => setEmailOpen(false)} title="Email user" size="md">
        {emailing ? (
          <EmailComposer
            key={emailing.id}
            layout="dialog"
            appUrl={appUrl}
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
    </div>
  );
}

export function UsersSkeleton() {
  return (
    <div className={styles.stack}>
      <div className={styles.section}>
        <Skeleton width="min(480px, 100%)" height={40} radius="md" />
        <SkeletonGroup label="Loading users" className={styles.list}>
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className={styles.row}>
              <div className={styles.rowMain}>
                <Skeleton width={32} height={32} radius="full" />
                <div className={`${styles.rowText} ${styles.skeletonText}`}>
                  <Skeleton width="30%" height={14} />
                  <Skeleton width="45%" height={12} />
                </div>
              </div>
            </div>
          ))}
        </SkeletonGroup>
      </div>
    </div>
  );
}
