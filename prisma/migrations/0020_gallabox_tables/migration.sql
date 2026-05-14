-- Migration 0020 — Gallabox integration tables
-- GallaboxMessage: stores incoming and outgoing WhatsApp messages

CREATE TABLE IF NOT EXISTS "GallaboxMessage" (
  "id"              TEXT        NOT NULL,
  "gallabox_id"     TEXT,
  "conversation_id" TEXT,
  "contact_phone"   TEXT,
  "contact_name"    TEXT,
  "direction"       TEXT        NOT NULL DEFAULT 'incoming',
  "message_type"    TEXT,
  "content"         TEXT,
  "media_url"       TEXT,
  "status"          TEXT,
  "failure_reason"  TEXT,
  "event_type"      TEXT,
  "raw_payload"     JSONB,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GallaboxMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "GallaboxMessage_gallabox_id_key"   ON "GallaboxMessage"("gallabox_id");
CREATE        INDEX IF NOT EXISTS "GallaboxMessage_conversation_id_idx" ON "GallaboxMessage"("conversation_id");
CREATE        INDEX IF NOT EXISTS "GallaboxMessage_contact_phone_idx"   ON "GallaboxMessage"("contact_phone");
CREATE        INDEX IF NOT EXISTS "GallaboxMessage_created_at_idx"      ON "GallaboxMessage"("created_at");

-- GallaboxConversation: tracks conversation state per contact

CREATE TABLE IF NOT EXISTS "GallaboxConversation" (
  "id"            TEXT        NOT NULL,
  "gallabox_id"   TEXT        NOT NULL,
  "contact_phone" TEXT,
  "contact_name"  TEXT,
  "status"        TEXT,
  "channel"       TEXT,
  "assigned_to"   TEXT,
  "raw_payload"   JSONB,
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GallaboxConversation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "GallaboxConversation_gallabox_id_key"   ON "GallaboxConversation"("gallabox_id");
CREATE        INDEX IF NOT EXISTS "GallaboxConversation_contact_phone_idx"  ON "GallaboxConversation"("contact_phone");
CREATE        INDEX IF NOT EXISTS "GallaboxConversation_status_idx"         ON "GallaboxConversation"("status");

-- GallaboxTemplate: tracks template approval/rejection status

CREATE TABLE IF NOT EXISTS "GallaboxTemplate" (
  "id"               TEXT        NOT NULL,
  "gallabox_id"      TEXT,
  "template_name"    TEXT,
  "status"           TEXT,
  "category"         TEXT,
  "language"         TEXT,
  "rejection_reason" TEXT,
  "raw_payload"      JSONB,
  "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GallaboxTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "GallaboxTemplate_gallabox_id_key" ON "GallaboxTemplate"("gallabox_id");
CREATE        INDEX IF NOT EXISTS "GallaboxTemplate_status_idx"       ON "GallaboxTemplate"("status");
