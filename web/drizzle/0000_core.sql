CREATE TYPE "public"."announcement_level" AS ENUM('info', 'warning', 'error');--> statement-breakpoint
CREATE TYPE "public"."email_type" AS ENUM('welcome', 'goodbye', 'class_availability', 'custom');--> statement-breakpoint
CREATE TABLE "announcements" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "announcements_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"message" varchar(500) NOT NULL,
	"level" "announcement_level" DEFAULT 'info' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "announcements_message_not_blank" CHECK (btrim("announcements"."message") <> ''),
	CONSTRAINT "announcements_expires_after_start" CHECK ("announcements"."expires_at" IS NULL OR "announcements"."expires_at" > "announcements"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "email_log" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "email_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" uuid,
	"recipient" text NOT NULL,
	"type" "email_type" NOT NULL,
	"term" char(6),
	"crn" varchar(5),
	"subject" text,
	"provider_message_id" text,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_log_term_format" CHECK ("email_log"."term" ~ '^\d{6}$'),
	CONSTRAINT "email_log_crn_format" CHECK ("email_log"."crn" ~ '^\d{5}$'),
	CONSTRAINT "email_log_class_availability_section" CHECK ("email_log"."type" <> 'class_availability' OR ("email_log"."term" IS NOT NULL AND "email_log"."crn" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "job_runs" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "job_runs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"job" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"ok" boolean,
	"summary" jsonb
);
--> statement-breakpoint
CREATE TABLE "schedule_entries" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "schedule_entries_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" uuid NOT NULL,
	"term" char(6) NOT NULL,
	"crn" varchar(5) NOT NULL,
	"subject" varchar(8) NOT NULL,
	"course_number" varchar(8) NOT NULL,
	"course_title" text,
	"color" smallint,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "schedule_entries_user_term_crn_key" UNIQUE("user_id","term","crn"),
	CONSTRAINT "schedule_entries_term_format" CHECK ("schedule_entries"."term" ~ '^\d{6}$'),
	CONSTRAINT "schedule_entries_crn_format" CHECK ("schedule_entries"."crn" ~ '^\d{5}$'),
	CONSTRAINT "schedule_entries_color_range" CHECK ("schedule_entries"."color" >= 0)
);
--> statement-breakpoint
CREATE TABLE "terms" (
	"code" char(6) PRIMARY KEY NOT NULL,
	"description" text NOT NULL,
	"view_only" boolean NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "terms_code_format" CHECK ("terms"."code" ~ '^\d{6}$')
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"picture_url" text,
	"google_sub" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "watched_sections" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "watched_sections_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" uuid NOT NULL,
	"term" char(6) NOT NULL,
	"crn" varchar(5) NOT NULL,
	"subject" varchar(8) NOT NULL,
	"course_number" varchar(8) NOT NULL,
	"course_title" text,
	"instructor" text,
	"notified_at" timestamp with time zone,
	"last_closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "watched_sections_user_term_crn_key" UNIQUE("user_id","term","crn"),
	CONSTRAINT "watched_sections_term_format" CHECK ("watched_sections"."term" ~ '^\d{6}$'),
	CONSTRAINT "watched_sections_crn_format" CHECK ("watched_sections"."crn" ~ '^\d{5}$')
);
--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_log" ADD CONSTRAINT "email_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_entries" ADD CONSTRAINT "schedule_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watched_sections" ADD CONSTRAINT "watched_sections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_log_sent_at_idx" ON "email_log" USING btree ("sent_at");--> statement-breakpoint
CREATE INDEX "email_log_recipient_type_sent_at_idx" ON "email_log" USING btree ("recipient","type","sent_at");--> statement-breakpoint
CREATE INDEX "email_log_user_id_idx" ON "email_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "job_runs_job_started_at_idx" ON "job_runs" USING btree ("job","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "schedule_entries_term_idx" ON "schedule_entries" USING btree ("term");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_lower_key" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX "users_google_sub_key" ON "users" USING btree ("google_sub") WHERE "users"."google_sub" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "watched_sections_course_idx" ON "watched_sections" USING btree ("term","subject","course_number");--> statement-breakpoint
-- security (hand-written; not generated by drizzle-kit)
-- The app connects as `postgres` through the pooler and nothing uses the Supabase Data API,
-- so the PostgREST roles get no access to public. RLS is deliberately NOT enabled: the app
-- must not depend on BYPASSRLS. The roles only exist on Supabase, hence the guards (PGlite and
-- plain local Postgres skip these). Re-running is harmless. ALTER DEFAULT PRIVILEGES applies
-- to objects later created by the role running this migration (postgres on Supabase).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
    REVOKE USAGE ON SCHEMA public FROM anon;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM authenticated;
    REVOKE USAGE ON SCHEMA public FROM authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM authenticated;
  END IF;
END $$;
