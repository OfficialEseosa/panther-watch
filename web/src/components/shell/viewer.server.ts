import "server-only";
import { unstable_rethrow } from "next/navigation";
import { connection } from "next/server";
import { listActive } from "@/lib/announcements";
import { getCurrentUser } from "@/lib/auth/session";
import type { ShellAnnouncement, Viewer } from "./types";

const GUEST: Viewer = { user: null, isAdmin: false };

/**
 * The viewer for the shell. Never throws: a failing session/DB lookup renders the guest shell
 * (and is logged) instead of an error page. Next's control-flow errors are rethrown.
 */
export async function loadViewer(): Promise<Viewer> {
  try {
    const user = await getCurrentUser();
    if (!user) return GUEST;
    return {
      user: { id: user.id, email: user.email, name: user.name ?? null, pictureUrl: user.pictureUrl ?? null },
      isAdmin: user.isAdmin,
    };
  } catch (error) {
    unstable_rethrow(error);
    console.error("shell: could not load the current user", error instanceof Error ? error.name : typeof error);
    return GUEST;
  }
}

/** Active announcements for the banner; [] on any failure (logged). Request-time. */
export async function loadAnnouncements(): Promise<ShellAnnouncement[]> {
  try {
    // listActive reads the clock; under Cache Components that must happen at request time.
    await connection();
    const list = await listActive();
    return list.map((item) => ({ id: String(item.id), message: item.message, level: item.level }));
  } catch (error) {
    unstable_rethrow(error);
    console.error("shell: could not load announcements", error instanceof Error ? error.name : typeof error);
    return [];
  }
}
