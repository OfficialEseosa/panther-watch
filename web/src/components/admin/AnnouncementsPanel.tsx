"use client";

import { useRouter } from "next/navigation";
import { startTransition, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { AlertIcon, BellIcon, CalendarIcon, ClockIcon, PauseIcon, PlayIcon, PlusIcon, TrashIcon, UserIcon, XIcon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/Toast";
import { adminApi, type AdminAnnouncement } from "@/lib/client/admin";
import { reportApiError } from "@/lib/client/http";
import { cn } from "@/lib/ui/cn";
import { AnnouncementEditor } from "./AnnouncementEditor";
import { announcementGroup, GROUP_ORDER, LEVEL_LABEL, type AnnouncementGroup } from "./announcementForm";
import { formatDateTimeFull, formatDateTimeZoned } from "./format";
import styles from "./Announcements.module.css";
import adminStyles from "./admin.module.css";

export type AnnouncementsPanelProps = {
  initial: AdminAnnouncement[];
  /** Server render time, so statuses match between server and client markup. */
  renderedAt: number;
};

const STATUS_LABEL: Record<AnnouncementGroup, string> = {
  live: "Active",
  scheduled: "Scheduled",
  paused: "Inactive",
  expired: "Expired",
};

/**
 * Announcements tab: the old Announcement Manager (AnnouncementManager.jsx). A header with
 * New Announcement, the inline form, and one card per announcement with its type, status,
 * dates and Edit / Deactivate / Delete. Mutations go through the admin API; router.refresh()
 * re-renders the shell so the global banner follows.
 */
export function AnnouncementsPanel({ initial, renderedAt }: AnnouncementsPanelProps) {
  const router = useRouter();
  const toast = useToast();
  const [items, setItems] = useState(initial);
  const [source, setSource] = useState(initial);
  const [now, setNow] = useState(renderedAt);
  const [formOpen, setFormOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [editing, setEditing] = useState<AdminAnnouncement | null>(null);
  const [deleting, setDeleting] = useState<AdminAnnouncement | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  /** Rows with a request in flight (per row, so two rows can be busy at once). */
  const [busyIds, setBusyIds] = useState<ReadonlySet<number>>(() => new Set());
  const setBusy = (id: number, busy: boolean) =>
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  const deleteBusy = deleting !== null && busyIds.has(deleting.id);

  // New server data (router.refresh) replaces local state.
  if (initial !== source) {
    setSource(initial);
    setItems(initial);
  }

  const refreshShell = () => startTransition(() => router.refresh());

  const openForm = (announcement: AdminAnnouncement | null) => {
    setEditing(announcement);
    setFormKey((k) => k + 1);
    setFormOpen(true);
  };

  const upsert = (announcement: AdminAnnouncement) => {
    setNow(Date.now());
    setItems((list) =>
      list.some((item) => item.id === announcement.id)
        ? list.map((item) => (item.id === announcement.id ? announcement : item))
        : [announcement, ...list],
    );
  };

  const toggle = async (announcement: AdminAnnouncement) => {
    if (busyIds.has(announcement.id)) return;
    setBusy(announcement.id, true);
    try {
      const { announcement: updated } = await adminApi.announcements.update(announcement.id, { active: !announcement.active });
      upsert(updated);
      toast.success(updated.active ? "Announcement activated" : "Announcement deactivated");
      refreshShell();
    } catch (caught) {
      reportApiError(toast, caught, "Couldn't update the announcement");
    } finally {
      setBusy(announcement.id, false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    const target = deleting;
    setBusy(target.id, true);
    try {
      await adminApi.announcements.remove(target.id);
      setItems((list) => list.filter((item) => item.id !== target.id));
      setDeleteOpen(false);
      toast.success("Announcement deleted");
      refreshShell();
    } catch (caught) {
      reportApiError(toast, caught, "Couldn't delete the announcement");
    } finally {
      setBusy(target.id, false);
    }
  };

  // Live first, then scheduled, inactive and expired (newest first inside each).
  const sorted = [...items].sort(
    (a, b) => GROUP_ORDER.indexOf(announcementGroup(a, now)) - GROUP_ORDER.indexOf(announcementGroup(b, now)),
  );

  return (
    <section className={adminStyles.section} aria-labelledby="admin-announcements">
      <div className={adminStyles.sectionHead}>
        <h2 id="admin-announcements" className={adminStyles.sectionHeading}>
          <BellIcon size={22} />
          Announcement Manager
        </h2>
        <button
          type="button"
          className={cn(adminStyles.btn, formOpen ? adminStyles.btnSecondary : adminStyles.btnPrimary)}
          onClick={() => (formOpen ? setFormOpen(false) : openForm(null))}
        >
          {formOpen ? <XIcon /> : <PlusIcon />}
          {formOpen ? "Cancel" : "New Announcement"}
        </button>
      </div>
      <p className={adminStyles.muted}>Active announcements show as a banner above every page. Visitors can dismiss them.</p>

      {formOpen ? (
        <AnnouncementEditor
          key={formKey}
          editing={editing}
          onCancel={() => setFormOpen(false)}
          onSaved={(announcement, created) => {
            upsert(announcement);
            setFormOpen(false);
            toast.success(created ? "Announcement published" : "Announcement saved");
            refreshShell();
          }}
        />
      ) : null}

      {items.length === 0 ? (
        <div className={styles.empty}>
          <BellIcon size={40} />
          <p>No announcements yet. Create one to get started!</p>
        </div>
      ) : (
        <ul className={styles.list} aria-label="Announcements">
          {sorted.map((item) => {
            const group = announcementGroup(item, now);
            const busy = busyIds.has(item.id);
            return (
              <li key={item.id} className={styles.card} data-level={item.level} data-status={group}>
                <div className={styles.cardHeader}>
                  <span className={styles.cardType}>
                    {item.level === "info" ? <BellIcon size={18} /> : <AlertIcon size={18} />}
                    {LEVEL_LABEL[item.level]}
                  </span>
                  <span className={styles.badge} data-status={group}>
                    {STATUS_LABEL[group]}
                  </span>
                </div>
                <p className={styles.message}>{item.message}</p>
                <div className={styles.dates}>
                  <div>
                    <CalendarIcon size={16} />
                    <span>
                      Starts: <DateText value={item.startsAt} />
                    </span>
                  </div>
                  <div>
                    <ClockIcon size={16} />
                    <span>Expires: {item.expiresAt ? <DateText value={item.expiresAt} /> : "No expiration"}</span>
                  </div>
                  {item.createdBy ? (
                    <div>
                      <UserIcon size={16} />
                      <span>By: {item.createdBy.name || item.createdBy.email}</span>
                    </div>
                  ) : null}
                </div>
                <div className={styles.actions}>
                  <button type="button" className={cn(adminStyles.btn, adminStyles.btnSmall, adminStyles.btnSecondary)} onClick={() => openForm(item)}>
                    Edit
                  </button>
                  <button
                    type="button"
                    className={cn(adminStyles.btn, adminStyles.btnSmall, item.active ? adminStyles.btnWarning : adminStyles.btnSuccess)}
                    disabled={busy}
                    onClick={() => void toggle(item)}
                  >
                    {item.active ? <PauseIcon /> : <PlayIcon />}
                    {busy ? "Saving…" : item.active ? "Deactivate" : "Activate"}
                  </button>
                  <button
                    type="button"
                    className={cn(adminStyles.btn, adminStyles.btnSmall, adminStyles.btnDanger)}
                    onClick={() => {
                      setDeleting(item);
                      setDeleteOpen(true);
                    }}
                  >
                    <TrashIcon />
                    Delete
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog
        open={deleteOpen}
        onClose={() => {
          if (!deleteBusy) setDeleteOpen(false);
        }}
        size="sm"
        title="Delete Announcement"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteOpen(false)} disabled={deleteBusy}>
              Cancel
            </Button>
            <Button variant="danger" leadingIcon={<TrashIcon />} data-autofocus="" loading={deleteBusy} onClick={() => void confirmDelete()}>
              Delete
            </Button>
          </>
        }
      >
        <p className={styles.confirmText}>
          Are you sure you want to delete &ldquo;{deleting?.message}&rdquo;? This action cannot be undone. To hide it for
          now, deactivate it instead.
        </p>
      </Dialog>
    </section>
  );
}

/** A date in GSU's zone ("Oct 25, 2:05 PM EDT"), so it reads the same for every admin. */
function DateText({ value }: { value: string }) {
  return (
    <time dateTime={value} title={formatDateTimeFull(value)}>
      {formatDateTimeZoned(value)}
    </time>
  );
}
