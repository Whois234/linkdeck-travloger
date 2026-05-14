-- Migration: 0021_user_availability_workflow_run
-- Add is_available to User + create WorkflowRun table

ALTER TABLE "User" ADD COLUMN "is_available" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "WorkflowRun" (
  "id"                 TEXT         NOT NULL,
  "workflow_id"        TEXT         NOT NULL,
  "contact_id"         TEXT,
  "contact_name"       TEXT,
  "trigger"            TEXT         NOT NULL,
  "conditions_matched" BOOLEAN      NOT NULL DEFAULT false,
  "action_type"        TEXT         NOT NULL,
  "action_detail"      TEXT,
  "assigned_to"        TEXT,
  "result"             TEXT         NOT NULL,
  "error"              TEXT,
  "created_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkflowRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WorkflowRun_workflow_id_idx" ON "WorkflowRun"("workflow_id");
CREATE INDEX "WorkflowRun_created_at_idx" ON "WorkflowRun"("created_at");
CREATE INDEX "User_is_available_idx" ON "User"("is_available");
