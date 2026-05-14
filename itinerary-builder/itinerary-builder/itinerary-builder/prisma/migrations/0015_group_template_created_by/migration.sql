-- Migration: 0015_group_template_created_by
-- Adds created_by (user id) and tab_title to GroupTemplate.

ALTER TABLE "GroupTemplate" ADD COLUMN IF NOT EXISTS "created_by" TEXT;
ALTER TABLE "GroupTemplate" ADD COLUMN IF NOT EXISTS "tab_title"  TEXT;

CREATE INDEX IF NOT EXISTS "GroupTemplate_created_by_idx" ON "GroupTemplate"("created_by");
