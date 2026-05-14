-- Migration: 0016_seed_autodetect_contact_fields
-- Seeds system ContactField rows for auto-detected device/OS/location data
-- captured when a customer opens their quote link.

INSERT INTO "ContactField" ("id","key","label","type","required","options","placeholder","sort_order","is_system","status","created_at","updated_at")
VALUES
  (gen_random_uuid()::text, 'detected_os',      'OS / Platform',    'select', false,
   '["iOS","Android","Windows","macOS","Linux","Unknown"]'::jsonb,
   'Auto-detected from quote open', 195, true, true, NOW(), NOW()),

  (gen_random_uuid()::text, 'detected_device',  'Device Type',      'select', false,
   '["Mobile","Tablet","Desktop"]'::jsonb,
   'Auto-detected from quote open', 200, true, true, NOW(), NOW()),

  (gen_random_uuid()::text, 'detected_browser', 'Browser',          'select', false,
   '["Chrome","Safari","Firefox","Edge","Opera","Unknown"]'::jsonb,
   'Auto-detected from quote open', 205, true, true, NOW(), NOW()),

  (gen_random_uuid()::text, 'detected_city',    'Detected City',    'text',   false, NULL,
   'Auto-filled from IP geolocation', 210, true, true, NOW(), NOW()),

  (gen_random_uuid()::text, 'detected_country', 'Detected Country', 'text',   false, NULL,
   'Auto-filled from IP geolocation', 215, true, true, NOW(), NOW())

ON CONFLICT ("key") DO NOTHING;
