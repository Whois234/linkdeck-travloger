-- Add rating_submitted and batch_selected to QuoteEventType enum
-- Run in Supabase SQL editor

ALTER TYPE "QuoteEventType" ADD VALUE IF NOT EXISTS 'rating_submitted';
ALTER TYPE "QuoteEventType" ADD VALUE IF NOT EXISTS 'batch_selected';
