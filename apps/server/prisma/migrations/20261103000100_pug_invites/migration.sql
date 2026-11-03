ALTER TABLE "PugSession" ADD COLUMN "name" TEXT,
ADD COLUMN "code" TEXT,
ADD COLUMN "settings" JSONB;

CREATE UNIQUE INDEX "PugSession_code_key" ON "PugSession"("code");

CREATE TABLE "PugInvite" (
    "token" TEXT NOT NULL,
    "pugId" TEXT NOT NULL,
    "role" TEXT NOT NULL,

    CONSTRAINT "PugInvite_pkey" PRIMARY KEY ("token")
);

CREATE UNIQUE INDEX "PugInvite_pugId_role_key" ON "PugInvite"("pugId", "role");

ALTER TABLE "PugInvite" ADD CONSTRAINT "PugInvite_pugId_fkey" FOREIGN KEY ("pugId") REFERENCES "PugSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
