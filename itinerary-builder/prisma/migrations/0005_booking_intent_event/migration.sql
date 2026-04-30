-- Migration: Add booking_intent to QuoteEventType enum
-- Run this in Supabase SQL editor

ALTER TYPE "QuoteEventType" ADD VALUE IF NOT EXISTS 'booking_intent';
