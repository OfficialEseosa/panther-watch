import type {
  announcements,
  emailLog,
  jobRuns,
  scheduleEntries,
  terms,
  users,
  watchedSections,
} from "./core";

export * from "./core";
export * from "./course-meta";

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Term = typeof terms.$inferSelect;
export type NewTerm = typeof terms.$inferInsert;
export type WatchedSection = typeof watchedSections.$inferSelect;
export type NewWatchedSection = typeof watchedSections.$inferInsert;
export type ScheduleEntry = typeof scheduleEntries.$inferSelect;
export type NewScheduleEntry = typeof scheduleEntries.$inferInsert;
export type EmailLogEntry = typeof emailLog.$inferSelect;
export type NewEmailLogEntry = typeof emailLog.$inferInsert;
export type Announcement = typeof announcements.$inferSelect;
export type NewAnnouncement = typeof announcements.$inferInsert;
export type JobRun = typeof jobRuns.$inferSelect;
export type NewJobRun = typeof jobRuns.$inferInsert;
