-- Create CRM Teams tables

CREATE TABLE IF NOT EXISTS "CrmTeam" (
    "id"         TEXT        NOT NULL,
    "name"       TEXT        NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CrmTeam_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CrmTeamMember" (
    "id"      TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    CONSTRAINT "CrmTeamMember_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CrmTeam_name_key"              ON "CrmTeam"("name");
CREATE UNIQUE INDEX IF NOT EXISTS "CrmTeamMember_team_id_user_id_key" ON "CrmTeamMember"("team_id", "user_id");
CREATE INDEX        IF NOT EXISTS "CrmTeamMember_team_id_idx"     ON "CrmTeamMember"("team_id");
CREATE INDEX        IF NOT EXISTS "CrmTeamMember_user_id_idx"     ON "CrmTeamMember"("user_id");

ALTER TABLE "CrmTeamMember"
    ADD CONSTRAINT "CrmTeamMember_team_id_fkey"
    FOREIGN KEY ("team_id") REFERENCES "CrmTeam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CrmTeamMember"
    ADD CONSTRAINT "CrmTeamMember_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
