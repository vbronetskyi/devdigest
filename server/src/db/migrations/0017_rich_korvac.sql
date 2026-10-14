CREATE TABLE "digest_highlights" (
	"workspace_id" uuid NOT NULL,
	"week" text NOT NULL,
	"lines" jsonb NOT NULL,
	"model" text NOT NULL,
	"cost_usd" double precision,
	"facts_hash" text NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "digest_highlights_workspace_id_week_pk" PRIMARY KEY("workspace_id","week")
);
--> statement-breakpoint
ALTER TABLE "digest_highlights" ADD CONSTRAINT "digest_highlights_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;