CREATE TABLE "comment" (
	"id" text PRIMARY KEY NOT NULL,
	"photo_id" text NOT NULL,
	"user_id" text,
	"guest_name" text,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "face" (
	"id" text PRIMARY KEY NOT NULL,
	"photo_id" text NOT NULL,
	"person_id" text,
	"box" jsonb,
	"embedding" real[],
	"score" real,
	"source" text DEFAULT 'auto' NOT NULL,
	"confirmed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "favorite" (
	"photo_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "favorite_photo_id_user_id_pk" PRIMARY KEY("photo_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "person" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"cover_face_id" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reaction" (
	"photo_id" text NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reaction_photo_id_user_id_kind_pk" PRIMARY KEY("photo_id","user_id","kind")
);
--> statement-breakpoint
CREATE TABLE "setting" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "album" ADD COLUMN "sort_mode" text DEFAULT 'date' NOT NULL;--> statement-breakpoint
ALTER TABLE "album" ADD COLUMN "show_map" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "album" ADD COLUMN "day_notes" jsonb;--> statement-breakpoint
ALTER TABLE "photo" ADD COLUMN "place" text;--> statement-breakpoint
ALTER TABLE "photo" ADD COLUMN "exif_taken_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "photo" ADD COLUMN "rotation" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "photo" ADD COLUMN "sort_index" double precision;--> statement-breakpoint
ALTER TABLE "photo" ADD COLUMN "guest_name" text;--> statement-breakpoint
ALTER TABLE "photo" ADD COLUMN "faces_scanned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "share_link" ADD COLUMN "allow_upload" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "email_notifications" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_photo_id_photo_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."photo"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "face" ADD CONSTRAINT "face_photo_id_photo_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."photo"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "face" ADD CONSTRAINT "face_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorite" ADD CONSTRAINT "favorite_photo_id_photo_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."photo"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorite" ADD CONSTRAINT "favorite_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person" ADD CONSTRAINT "person_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reaction" ADD CONSTRAINT "reaction_photo_id_photo_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."photo"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reaction" ADD CONSTRAINT "reaction_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comment_photo_idx" ON "comment" USING btree ("photo_id","created_at");--> statement-breakpoint
CREATE INDEX "face_photo_idx" ON "face" USING btree ("photo_id");--> statement-breakpoint
CREATE INDEX "face_person_idx" ON "face" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "favorite_user_idx" ON "favorite" USING btree ("user_id");--> statement-breakpoint
UPDATE "photo" SET "exif_taken_at" = "taken_at" WHERE "exif_taken_at" IS NULL AND "status" = 'ready';
