-- Migration: 0011_seed_system_contact_fields
-- Creates ContactField and ContactTag tables (missing from DB),
-- then seeds the 5 built-in system fields.

-- ─── ContactField ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ContactField" (
    "id"          TEXT         NOT NULL,
    "key"         TEXT         NOT NULL,
    "label"       TEXT         NOT NULL,
    "type"        TEXT         NOT NULL DEFAULT 'text',
    "required"    BOOLEAN      NOT NULL DEFAULT false,
    "options"     JSONB,
    "placeholder" TEXT,
    "sort_order"  INTEGER      NOT NULL DEFAULT 0,
    "is_system"   BOOLEAN      NOT NULL DEFAULT false,
    "status"      BOOLEAN      NOT NULL DEFAULT true,
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContactField_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ContactField_key_key"       ON "ContactField"("key");
CREATE INDEX        IF NOT EXISTS "ContactField_sort_order_idx" ON "ContactField"("sort_order");

-- ─── ContactTag ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ContactTag" (
    "id"         TEXT         NOT NULL,
    "name"       TEXT         NOT NULL,
    "color"      TEXT         NOT NULL DEFAULT '#64748B',
    "status"     BOOLEAN      NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContactTag_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ContactTag_name_key" ON "ContactTag"("name");

-- ─── Seed system contact fields ───────────────────────────────────────────────
-- These map to the real CrmContact columns (name, phone, email, source, notes).
-- is_system=true prevents deletion; type is locked in the UI.
INSERT INTO "ContactField" ("id","key","label","type","required","placeholder","sort_order","is_system","status","created_at","updated_at")
VALUES
  (gen_random_uuid()::text, 'name',   'Full Name',    'text',     true,  'e.g. Ravi Kumar',         10, true, true, NOW(), NOW()),
  (gen_random_uuid()::text, 'phone',  'Phone',         'phone',    true,  'e.g. 9876543210',         20, true, true, NOW(), NOW()),
  (gen_random_uuid()::text, 'email',  'Email',         'email',    false, 'e.g. ravi@example.com',   30, true, true, NOW(), NOW()),
  (gen_random_uuid()::text, 'source', 'Lead Source',   'text',     false, 'e.g. Instagram, Walk-in', 40, true, true, NOW(), NOW()),
  (gen_random_uuid()::text, 'notes',  'Notes',         'textarea', false, 'Any additional notes…',   50, true, true, NOW(), NOW())
ON CONFLICT ("key") DO NOTHING;
