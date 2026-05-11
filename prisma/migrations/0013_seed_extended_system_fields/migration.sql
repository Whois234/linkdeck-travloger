-- Migration: 0013_seed_extended_system_fields
-- Seeds ContactField rows for all new CrmContact columns added in migration 0012.
-- All rows are is_system=true (label-only editable, cannot be deleted).
-- ON CONFLICT DO NOTHING so re-running is safe.

INSERT INTO "ContactField" ("id","key","label","type","required","options","placeholder","sort_order","is_system","status","created_at","updated_at")
VALUES
  -- ── Travel intent fields ────────────────────────────────────────────────────
  (gen_random_uuid()::text, 'city',                 'City',                  'text',     false, NULL,                                                         'e.g. Mumbai',           55,  true, true, NOW(), NOW()),
  (gen_random_uuid()::text, 'destination_interest', 'Interested Destination','text',     false, NULL,                                                         'e.g. Goa, Manali',      60,  true, true, NOW(), NOW()),
  (gen_random_uuid()::text, 'trip_type',            'Trip Type',             'select',   false, '["HONEYMOON","FAMILY","FRIENDS","SOLO","CORPORATE","PILGRIMAGE","ADVENTURE","OTHER"]'::jsonb, NULL, 70, true, true, NOW(), NOW()),
  (gen_random_uuid()::text, 'travel_month',         'Travel Month',          'text',     false, NULL,                                                         'e.g. Dec 2025',         80,  true, true, NOW(), NOW()),
  (gen_random_uuid()::text, 'budget_min',           'Min Budget (₹)',        'number',   false, NULL,                                                         'e.g. 50000',            90,  true, true, NOW(), NOW()),
  (gen_random_uuid()::text, 'budget_max',           'Max Budget (₹)',        'number',   false, NULL,                                                         'e.g. 150000',           100, true, true, NOW(), NOW()),
  (gen_random_uuid()::text, 'num_adults',           'No. of Adults',         'number',   false, NULL,                                                         'e.g. 2',                110, true, true, NOW(), NOW()),
  (gen_random_uuid()::text, 'num_children',         'No. of Children',       'number',   false, NULL,                                                         'e.g. 1',                120, true, true, NOW(), NOW()),
  -- ── CRM fields ──────────────────────────────────────────────────────────────
  (gen_random_uuid()::text, 'follow_up_date',       'Follow-up Date',        'date',     false, NULL,                                                         NULL,                    130, true, true, NOW(), NOW()),
  (gen_random_uuid()::text, 'booking_value',        'Booking Value (₹)',     'number',   false, NULL,                                                         'e.g. 85000',            140, true, true, NOW(), NOW()),
  -- ── Ad attribution fields ────────────────────────────────────────────────────
  (gen_random_uuid()::text, 'ad_platform',          'Ad Platform',           'select',   false, '["FACEBOOK","INSTAGRAM","GOOGLE","YOUTUBE","WHATSAPP","OTHER"]'::jsonb, NULL, 150, true, true, NOW(), NOW()),
  (gen_random_uuid()::text, 'ad_campaign',          'Campaign Name',         'text',     false, NULL,                                                         'e.g. Summer Goa',       155, true, true, NOW(), NOW()),
  (gen_random_uuid()::text, 'ad_set',               'Ad Set',                'text',     false, NULL,                                                         NULL,                    160, true, true, NOW(), NOW()),
  (gen_random_uuid()::text, 'ad_creative',          'Creative Name',         'text',     false, NULL,                                                         NULL,                    165, true, true, NOW(), NOW()),
  (gen_random_uuid()::text, 'utm_source',           'UTM Source',            'text',     false, NULL,                                                         'e.g. facebook',         170, true, true, NOW(), NOW()),
  (gen_random_uuid()::text, 'utm_medium',           'UTM Medium',            'text',     false, NULL,                                                         'e.g. cpc',              175, true, true, NOW(), NOW()),
  (gen_random_uuid()::text, 'utm_campaign',         'UTM Campaign',          'text',     false, NULL,                                                         NULL,                    180, true, true, NOW(), NOW()),
  (gen_random_uuid()::text, 'utm_content',          'UTM Content',           'text',     false, NULL,                                                         NULL,                    185, true, true, NOW(), NOW()),
  (gen_random_uuid()::text, 'utm_term',             'UTM Term',              'text',     false, NULL,                                                         NULL,                    190, true, true, NOW(), NOW())
ON CONFLICT ("key") DO NOTHING;
