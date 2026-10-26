CREATE TABLE "grade_terms" (
	"term" char(6) PRIMARY KEY NOT NULL,
	"posted" boolean DEFAULT true NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rmp_cache" (
	"query_key" text PRIMARY KEY NOT NULL,
	"payload" jsonb,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "section_grades" (
	"term" char(6) NOT NULL,
	"crn" text NOT NULL,
	"subject" text NOT NULL,
	"course_number" text NOT NULL,
	"section" text DEFAULT '' NOT NULL,
	"professor" text,
	"professor_key" text,
	"instruction_method" text,
	"grade_a" integer DEFAULT 0 NOT NULL,
	"grade_b" integer DEFAULT 0 NOT NULL,
	"grade_c" integer DEFAULT 0 NOT NULL,
	"grade_d" integer DEFAULT 0 NOT NULL,
	"grade_f" integer DEFAULT 0 NOT NULL,
	"a_plus" integer DEFAULT 0 NOT NULL,
	"a_flat" integer DEFAULT 0 NOT NULL,
	"a_minus" integer DEFAULT 0 NOT NULL,
	"b_plus" integer DEFAULT 0 NOT NULL,
	"b_flat" integer DEFAULT 0 NOT NULL,
	"b_minus" integer DEFAULT 0 NOT NULL,
	"c_plus" integer DEFAULT 0 NOT NULL,
	"c_flat" integer DEFAULT 0 NOT NULL,
	"c_minus" integer DEFAULT 0 NOT NULL,
	"wf" integer DEFAULT 0 NOT NULL,
	"withdraw_count" integer DEFAULT 0 NOT NULL,
	"other_count" integer DEFAULT 0 NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"gpa" numeric(4, 2),
	CONSTRAINT "section_grades_term_crn_pk" PRIMARY KEY("term","crn")
);
--> statement-breakpoint
CREATE TABLE "syllabi" (
	"term" char(6) NOT NULL,
	"crn" text NOT NULL,
	"path" text NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "syllabi_term_crn_pk" PRIMARY KEY("term","crn")
);
--> statement-breakpoint
ALTER TABLE "section_grades" ADD CONSTRAINT "section_grades_term_grade_terms_term_fk" FOREIGN KEY ("term") REFERENCES "public"."grade_terms"("term") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "section_grades_course_idx" ON "section_grades" USING btree ("subject","course_number");--> statement-breakpoint
CREATE INDEX "section_grades_professor_key_idx" ON "section_grades" USING btree ("professor_key");