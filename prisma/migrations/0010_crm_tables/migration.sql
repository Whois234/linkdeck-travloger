-- Migration: 0010_crm_tables
-- Adds missing columns to CrmContact and Lead that were absent from production
-- (tables were already created via prisma db push but some columns were added later to the schema)
-- All statements use IF NOT EXISTS so this is safe to re-run.

-- ─── CrmContact — add columns that exist in schema but not in DB ───────────────
ALTER TABLE "CrmContact" ADD COLUMN IF NOT EXISTS "last_known_city" TEXT;
ALTER TABLE "CrmContact" ADD COLUMN IF NOT EXISTS "last_seen_at"    TIMESTAMP(3);
ALTER TABLE "CrmContact" ADD COLUMN IF NOT EXISTS "custom_fields"   JSONB;
ALTER TABLE "CrmContact" ADD COLUMN IF NOT EXISTS "tags"            TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Create indexes for the new columns (IF NOT EXISTS is supported on CREATE INDEX)
CREATE INDEX IF NOT EXISTS "CrmContact_is_converted_idx" ON "CrmContact"("is_converted");
CREATE INDEX IF NOT EXISTS "CrmContact_created_at_idx"   ON "CrmContact"("created_at");
CREATE INDEX IF NOT EXISTS "CrmContact_tags_idx"         ON "CrmContact" USING GIN("tags");

-- ─── Add perf indexes that were added to schema.prisma ────────────────────────
CREATE INDEX IF NOT EXISTS "Lead_crm_contact_id_idx" ON "Lead"("crm_contact_id");
CREATE INDEX IF NOT EXISTS "Lead_pipeline_id_idx"    ON "Lead"("pipeline_id");
CREATE INDEX IF NOT EXISTS "Lead_stage_id_idx"       ON "Lead"("stage_id");
CREATE INDEX IF NOT EXISTS "Lead_owner_id_idx"       ON "Lead"("owner_id");
