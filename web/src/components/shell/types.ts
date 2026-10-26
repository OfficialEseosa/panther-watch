/** What the shell needs to know about the signed-in user. Serializable (crosses to the client). */
export type ShellUser = {
  id: string;
  email: string;
  name: string | null;
  pictureUrl: string | null;
};

export type Viewer = {
  user: ShellUser | null;
  isAdmin: boolean;
};

export type AnnouncementLevel = "info" | "warning" | "error";

/** One active announcement as the banner renders it. */
export type ShellAnnouncement = {
  id: string;
  message: string;
  level: AnnouncementLevel;
};
