-- Add soft-delete trash bin: deleted_at timestamp on both template tables
ALTER TABLE "PrivateTemplate" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP;
ALTER TABLE "GroupTemplate"   ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP;

CREATE INDEX IF NOT EXISTS "PrivateTemplate_deleted_at_idx" ON "PrivateTemplate"("deleted_at");
CREATE INDEX IF NOT EXISTS "GroupTemplate_deleted_at_idx"   ON "GroupTemplate"("deleted_at");

-- Mark existing status=false templates as deleted NOW so they go into the trash bin
-- (They were soft-deleted before but had no deleted_at timestamp)
UPDATE "PrivateTemplate" SET "deleted_at" = NOW() WHERE "status" = false AND "deleted_at" IS NULL;
UPDATE "GroupTemplate"   SET "deleted_at" = NOW() WHERE "status" = false AND "deleted_at" IS NULL;
