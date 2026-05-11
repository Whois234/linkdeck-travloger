-- Add FILLING_FAST value to GroupBatchStatus enum
-- Run this against your Supabase database via the SQL Editor

ALTER TYPE "GroupBatchStatus" ADD VALUE IF NOT EXISTS 'FILLING_FAST';
