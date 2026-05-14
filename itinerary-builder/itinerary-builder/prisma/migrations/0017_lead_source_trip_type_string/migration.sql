-- Convert LeadSource, TripType, Platform enum columns to TEXT (no data loss)
ALTER TABLE "CrmContact"
  ALTER COLUMN "lead_source" TYPE TEXT USING "lead_source"::TEXT,
  ALTER COLUMN "trip_type"   TYPE TEXT USING "trip_type"::TEXT,
  ALTER COLUMN "platform"    TYPE TEXT USING "platform"::TEXT;

-- Update ContactField records to make source, trip_type, platform show as 'select' with proper options
UPDATE "ContactField" SET
  type = 'select',
  options = '["CTWA","META_LEAD_FORM","GOOGLE_ADS","WEBSITE","WALK_IN","REFERRAL"]'::jsonb
WHERE key = 'source';

UPDATE "ContactField" SET
  type = 'select',
  options = '["HONEYMOON","FAMILY","FRIENDS","SOLO","GROUP","CORPORATE","PILGRIMAGE","ADVENTURE","PRIVATE","OTHER"]'::jsonb
WHERE key = 'trip_type';

-- Insert platform ContactField if it doesn't exist, or update
INSERT INTO "ContactField" (id, key, label, type, required, is_system, status, sort_order, options, placeholder, created_at, updated_at)
VALUES (
  gen_random_uuid(), 'platform', 'Platform', 'select', false, true, true, 999,
  '["FACEBOOK","INSTAGRAM","GOOGLE","YOUTUBE","WEBSITE","WHATSAPP"]'::jsonb,
  'e.g. Facebook', NOW(), NOW()
)
ON CONFLICT (key) DO UPDATE SET
  type = 'select',
  options = '["FACEBOOK","INSTAGRAM","GOOGLE","YOUTUBE","WEBSITE","WHATSAPP"]'::jsonb;
