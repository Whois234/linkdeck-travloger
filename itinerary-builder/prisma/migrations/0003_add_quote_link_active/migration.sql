-- Add link_active field to Quote table
-- Run this in your Supabase SQL Editor

ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "link_active" BOOLEAN NOT NULL DEFAULT true;
