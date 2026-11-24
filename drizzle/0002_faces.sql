ALTER TABLE "face" ADD COLUMN "hidden" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "face" ADD COLUMN "rejected" text[] DEFAULT '{}'::text[] NOT NULL;