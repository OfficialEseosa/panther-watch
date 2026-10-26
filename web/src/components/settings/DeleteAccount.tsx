"use client";

import { useId, useState } from "react";
import type { FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { TrashIcon } from "@/components/ui/icons";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { onUnauthorized } from "@/lib/client/http";
import styles from "./Settings.module.css";

const CONFIRM_WORD = "DELETE";

/**
 * Delete account (pages.md §7): a danger button opening a confirm Dialog (`sm`) that lists what
 * goes, and a typed confirmation. Focus starts on Cancel. On success the route has already
 * cleared the cookie; we toast and do a full navigation to "/" so every client cache is gone.
 */
export function DeleteAccount({ email }: { email: string }) {
  const toast = useToast();
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [pending, setPending] = useState(false);
  // Case-insensitive (pages.md §7: typing "delete" is enough); the hint shows the word in capitals.
  const matches = typed.trim().toLowerCase() === CONFIRM_WORD.toLowerCase();

  const close = () => {
    if (pending) return;
    setOpen(false);
    setTyped("");
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!matches || pending) return;
    setPending(true);
    try {
      const response = await fetch("/api/account", {
        method: "DELETE",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      if (response.ok) {
        toast.success("Your account was deleted", { body: "Thanks for using PantherWatch." });
        // A full document load on purpose: drops the router cache and every client state of the old session.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign("/");
        return;
      }
      if (response.status === 401) {
        onUnauthorized(toast, { title: "Your session expired", body: "Sign in again to delete your account." });
      } else {
        toast.error("Couldn't delete your account", { body: "Nothing was removed. Try again in a moment." });
      }
    } catch {
      toast.error("Couldn't delete your account", { body: "Check your connection and try again." });
    }
    setPending(false);
  };

  return (
    <>
      {/* The original Settings "action row": icon, label and a one-line description. */}
      <button type="button" className={`${styles.action} ${styles.actionDelete}`} onClick={() => setOpen(true)}>
        <TrashIcon className={styles.actionIcon} />
        <span className={styles.actionInfo}>
          <span className={styles.actionLabel}>Delete account</span>
          <span className={styles.actionDescription}>
            Permanently delete your account, tracked classes and schedule
          </span>
        </span>
      </button>
      <Dialog
        open={open}
        onClose={close}
        size="sm"
        title="Delete your PantherWatch account?"
        footer={
          <>
            <Button variant="secondary" onClick={close} disabled={pending} data-autofocus>
              Cancel
            </Button>
            <Button type="submit" form={formId} variant="danger" disabled={!matches} loading={pending}>
              Delete account
            </Button>
          </>
        }
      >
        <form id={formId} onSubmit={onSubmit} className={styles.confirm}>
          <p>This permanently deletes:</p>
          <ul className={styles.list}>
            <li>Your tracked classes and their seat alerts</li>
            <li>Your schedule, for every term</li>
            <li>Your account: name, email and Google profile photo</li>
          </ul>
          <p>
            We&rsquo;ll send one last email to <strong className={styles.email}>{email}</strong> to confirm.
            This can&rsquo;t be undone.
          </p>
          <Field label={`Type ${CONFIRM_WORD} to confirm`}>
            <Input
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              autoComplete="off"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              disabled={pending}
            />
          </Field>
        </form>
      </Dialog>
    </>
  );
}
