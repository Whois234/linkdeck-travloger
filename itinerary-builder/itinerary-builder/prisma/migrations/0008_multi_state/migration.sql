-- Add state_ids array to Quote and PrivateTemplate for multi-state trip support
ALTER TABLE "Quote" ADD COLUMN "state_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "PrivateTemplate" ADD COLUMN "state_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
