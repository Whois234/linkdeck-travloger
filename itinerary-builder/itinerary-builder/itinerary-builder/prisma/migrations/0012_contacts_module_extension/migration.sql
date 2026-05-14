-- Migration: 0012_contacts_module_extension
-- Extends CrmContact with travel-interest, ad-attribution, CRM-workflow and
-- conversion fields per the Contacts module spec. Adds ContactActivity table.
-- All statements are idempotent — safe to re-run.

-- ─── Enums ───────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "TripType"            AS ENUM ('GROUP', 'PRIVATE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "LeadSource"          AS ENUM ('CTWA', 'META_LEAD_FORM', 'GOOGLE_ADS', 'WEBSITE', 'WALK_IN', 'REFERRAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "Platform"            AS ENUM ('FACEBOOK', 'INSTAGRAM', 'GOOGLE', 'YOUTUBE', 'WEBSITE', 'WHATSAPP');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "DevicePlatform"      AS ENUM ('MOBILE', 'DESKTOP');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "LeadStage"           AS ENUM ('NEW', 'CONTACTED', 'FOLLOW_UP', 'HOT', 'CONVERTED', 'LOST');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ContactActivityType" AS ENUM ('STAGE_CHANGE', 'ASSIGNMENT_CHANGE', 'WHATSAPP_SENT', 'LEAD_CREATED', 'FIELD_UPDATE', 'CONTACT_DELETED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── CrmContact — new columns ────────────────────────────────────────────────
ALTER TABLE "CrmContact" ADD COLUMN IF NOT EXISTS "city"                   TEXT;
ALTER TABLE "CrmContact" ADD COLUMN IF NOT EXISTS "interested_destination" TEXT;
ALTER TABLE "CrmContact" ADD COLUMN IF NOT EXISTS "number_of_travellers"   INTEGER;
ALTER TABLE "CrmContact" ADD COLUMN IF NOT EXISTS "trip_type"              "TripType";
ALTER TABLE "CrmContact" ADD COLUMN IF NOT EXISTS "special_requirements"   TEXT;
ALTER TABLE "CrmContact" ADD COLUMN IF NOT EXISTS "budget_per_person"      DECIMAL(12,2);

ALTER TABLE "CrmContact" ADD COLUMN IF NOT EXISTS "lead_source"            "LeadSource";
ALTER TABLE "CrmContact" ADD COLUMN IF NOT EXISTS "platform"               "Platform";
ALTER TABLE "CrmContact" ADD COLUMN IF NOT EXISTS "campaign_name"          TEXT;
ALTER TABLE "CrmContact" ADD COLUMN IF NOT EXISTS "ad_set_name"            TEXT;
ALTER TABLE "CrmContact" ADD COLUMN IF NOT EXISTS "ad_name"                TEXT;
ALTER TABLE "CrmContact" ADD COLUMN IF NOT EXISTS "other_ad_details"       JSONB;
ALTER TABLE "CrmContact" ADD COLUMN IF NOT EXISTS "device_platform"        "DevicePlatform";
ALTER TABLE "CrmContact" ADD COLUMN IF NOT EXISTS "facebook_click_id"      TEXT;
ALTER TABLE "CrmContact" ADD COLUMN IF NOT EXISTS "facebook_browser_id"    TEXT;
ALTER TABLE "CrmContact" ADD COLUMN IF NOT EXISTS "google_click_id"        TEXT;
ALTER TABLE "CrmContact" ADD COLUMN IF NOT EXISTS "platform_lead_id"       TEXT;
ALTER TABLE "CrmContact" ADD COLUMN IF NOT EXISTS "gallabox_contact_id"    TEXT;

ALTER TABLE "CrmContact" ADD COLUMN IF NOT EXISTS "lead_stage"             "LeadStage" NOT NULL DEFAULT 'NEW';
ALTER TABLE "CrmContact" ADD COLUMN IF NOT EXISTS "assigned_to_id"         TEXT;
ALTER TABLE "CrmContact" ADD COLUMN IF NOT EXISTS "follow_up_date"         TIMESTAMP(3);
ALTER TABLE "CrmContact" ADD COLUMN IF NOT EXISTS "closed_date"            TIMESTAMP(3);
ALTER TABLE "CrmContact" ADD COLUMN IF NOT EXISTS "booking_value"          DECIMAL(12,2);
ALTER TABLE "CrmContact" ADD COLUMN IF NOT EXISTS "do_not_contact"         BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CrmContact" ADD COLUMN IF NOT EXISTS "deleted_at"             TIMESTAMP(3);

-- ─── FK for assigned_to ──────────────────────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE "CrmContact"
    ADD CONSTRAINT "CrmContact_assigned_to_id_fkey"
    FOREIGN KEY ("assigned_to_id") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── Indexes ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "CrmContact_assigned_to_id_idx"         ON "CrmContact"("assigned_to_id");
CREATE INDEX IF NOT EXISTS "CrmContact_lead_stage_idx"             ON "CrmContact"("lead_stage");
CREATE INDEX IF NOT EXISTS "CrmContact_lead_source_idx"            ON "CrmContact"("lead_source");
CREATE INDEX IF NOT EXISTS "CrmContact_interested_destination_idx" ON "CrmContact"("interested_destination");
CREATE INDEX IF NOT EXISTS "CrmContact_deleted_at_idx"             ON "CrmContact"("deleted_at");

-- ─── ContactActivity ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ContactActivity" (
  "id"              TEXT NOT NULL,
  "contact_id"      TEXT NOT NULL,
  "type"            "ContactActivityType" NOT NULL,
  "description"     TEXT NOT NULL,
  "metadata"        JSONB,
  "performed_by_id" TEXT,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContactActivity_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "ContactActivity"
    ADD CONSTRAINT "ContactActivity_contact_id_fkey"
    FOREIGN KEY ("contact_id") REFERENCES "CrmContact"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ContactActivity"
    ADD CONSTRAINT "ContactActivity_performed_by_id_fkey"
    FOREIGN KEY ("performed_by_id") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "ContactActivity_contact_id_created_at_idx" ON "ContactActivity"("contact_id", "created_at");
CREATE INDEX IF NOT EXISTS "ContactActivity_type_idx"                  ON "ContactActivity"("type");
