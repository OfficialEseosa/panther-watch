"use client";

import { useRouter } from "next/navigation";
import { startTransition, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { BellIcon, MoreIcon, PauseIcon, PlayIcon, PlusIcon, TrashIcon } from "@/components/ui/icons";
import { Menu, MenuItem } from "@/components/ui/Menu";
import { useToast } from "@/components/ui/Toast";
import { adminApi, type AdminAnnouncement } from "@/lib/client/admin";
import { reportApiError } from "@/lib/client/http";
import { AnnouncementEditor } from "./AnnouncementEditor";
import { GROUP_LABEL, GROUP_ORDER, groupAnnouncements, LEVEL_LABEL, LEVEL_TONE } from "./announcementForm";
import { formatDateTimeFull, formatDateTimeZoned } from "./format";
import styles from "./Announcements.module.css";
import adminStyles from "./admin.module.css";
import menuStyles from "./UsersPanel.module.css";

export type AnnouncementsPanelProps = {
  initial: AdminAnnouncement[];
  /** Server render time, so grouping matches between server and client markup. */
  renderedAt: number;
};


/**
 * Announcements tab (pages.md §8.3): grouped list (Live / Scheduled / Paused / Expired),
 * pause/resume, edit and delete. Mutations go through the admin API; the list updates from
 * the response, and router.refresh() re-renders the shell so the global banner follows.
 */
export function AnnouncementsPanel({ initial, renderedAt }: AnnouncementsPanelProps) {
  const router = useRouter();
  const toast = useToast();
  const [items, setItems] = useState(initial);
  const [source, setSource] = useState(initial);
  const [now, setNow] = useState(renderedAt);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorKey, setEditorKey] = useState(0);
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

  const openEditor = (announcement: AdminAnnouncement | null) => {
    setEditing(announcement);
    setEditorKey((k) => k + 1);
    setEditorOpen(true);
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
      const { announcement: updated } = await adminApi.announcements.update(announcement.id, {
        active: !announcement.active,
      });
      upsert(updated);
      toast.success(updated.active ? "Announcement resumed" : "Announcement paused");
      refreshShell();
    } catch (error) {
      reportApiError(toast, error, "Couldn't update the announcement");
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
    } catch (error) {
      reportApiError(toast, error, "Couldn't delete the announcement");
    } finally {
      setBusy(target.id, false);
    }
  };

  const groups = groupAnnouncements(items, now);

  return (
    <div className={adminStyles.stack}>
      <div className={adminStyles.toolbar}>
        <p className={adminStyles.muted}>
          Live announcements show as a banner above every page. Visitors can dismiss them.
        </p>
        <Button leadingIcon={<PlusIcon />} onClick={() => openEditor(null)}>
          New announcement
        </Button>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={<BellIcon size={24} />}
          title="No announcements."
          actions={
            <Button leadingIcon={<PlusIcon />} onClick={() => openEditor(null)}>
              New announcement
            </Button>
          }
        >
          Post a banner for registration dates, maintenance windows or outages.
        </EmptyState>
      ) : (
        GROUP_ORDER.filter((group) => groups[group].length > 0).map((group) => (
          <section key={group} className={adminStyles.section} aria-labelledby={`ann-${group}`}>
            <h2 id={`ann-${group}`} className={adminStyles.sectionTitle}>
              {GROUP_LABEL[group]} <span className={adminStyles.muted}>({groups[group].length})</span>
            </h2>
            <ul className={adminStyles.list}>
              {groups[group].map((item) => (
                <li key={item.id} className={adminStyles.row}>
                  <div className={styles.rowBody}>
                    <div className={styles.badges}>
                      <Badge tone={LEVEL_TONE[item.level]}>{LEVEL_LABEL[item.level]}</Badge>
                      {group === "live" ? <Badge tone="success">Live</Badge> : null}
                    </div>
                    <p className={styles.message}>{item.message}</p>
                    <p className={styles.window}>
                      <WindowText item={item} />
                      {item.createdBy ? <> · by {item.createdBy.name || item.createdBy.email}</> : null}
                    </p>
                  </div>
                  <div className={adminStyles.rowActions}>
                    <Button
                      variant="secondary"
                      size="sm"
                      leadingIcon={item.active ? <PauseIcon /> : <PlayIcon />}
                      loading={busyIds.has(item.id)}
                      onClick={() => void toggle(item)}
                    >
                      {item.active ? "Pause" : "Resume"}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => openEditor(item)}>
                      Edit
                    </Button>
                    <Menu
                      trigger={<MoreIcon />}
                      triggerLabel="More actions"
                      triggerClassName={menuStyles.trigger}
                      label="Announcement actions"
                    >
                      <MenuItem
                        tone="danger"
                        icon={<TrashIcon size={16} />}
                        onSelect={() => {
                          setDeleting(item);
                          setDeleteOpen(true);
                        }}
                      >
                        Delete…
                      </MenuItem>
                    </Menu>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      <AnnouncementEditor
        key={editorKey}
        open={editorOpen}
        editing={editing}
        onClose={() => setEditorOpen(false)}
        onSaved={(announcement, created) => {
          upsert(announcement);
          setEditorOpen(false);
          toast.success(created ? "Announcement published" : "Announcement saved");
          refreshShell();
        }}
      />

      <Dialog
        open={deleteOpen}
        onClose={() => {
          if (!deleteBusy) setDeleteOpen(false);
        }}
        size="sm"
        title="Delete this announcement?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteOpen(false)} disabled={deleteBusy}>
              Cancel
            </Button>
            <Button
              variant="danger"
              data-autofocus=""
              loading={deleteBusy}
              onClick={() => void confirmDelete()}
            >
              Delete
            </Button>
          </>
        }
      >
        <p className={styles.confirmText}>
          &ldquo;{deleting?.message}&rdquo; is removed for good. To hide it temporarily, pause it instead.
        </p>
      </Dialog>
    </div>
  );
}

/** The window in GSU's zone, labeled ("Oct 25, 2:05 PM EDT"), so it reads the same for every admin. */
function WindowText({ item }: { item: AdminAnnouncement }) {
  const start = <time dateTime={item.startsAt} title={formatDateTimeFull(item.startsAt)}>{formatDateTimeZoned(item.startsAt)}</time>;
  if (!item.expiresAt) return <>From {start}, no end date</>;
  return (
    <>
      {start} – <time dateTime={item.expiresAt} title={formatDateTimeFull(item.expiresAt)}>{formatDateTimeZoned(item.expiresAt)}</time>
    </>
  );
}
