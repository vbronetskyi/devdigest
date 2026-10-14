CREATE INDEX "reviews_run_id_idx" ON "reviews" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "agent_runs_workspace_ran_at_idx" ON "agent_runs" USING btree ("workspace_id","ran_at");