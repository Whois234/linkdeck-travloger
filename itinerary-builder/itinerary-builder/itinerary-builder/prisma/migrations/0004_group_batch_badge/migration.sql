-- Add badge_text and badge_color to GroupBatch
ALTER TABLE "GroupBatch" ADD COLUMN IF NOT EXISTS "badge_text"  TEXT;
ALTER TABLE "GroupBatch" ADD COLUMN IF NOT EXISTS "badge_color" TEXT;
