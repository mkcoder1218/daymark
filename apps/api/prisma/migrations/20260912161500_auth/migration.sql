CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

INSERT INTO "User" ("id", "email", "passwordHash", "fullName", "createdAt", "updatedAt")
VALUES ('legacy', '__legacy__@daymark.local', 'legacy-unusable-password', 'Legacy Daymark', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

ALTER TABLE "Goal" ADD COLUMN "userId" TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE "Goal" ALTER COLUMN "userId" DROP DEFAULT;

ALTER TABLE "AppSettings" ADD COLUMN "userId" TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE "AppSettings" ALTER COLUMN "userId" DROP DEFAULT;
ALTER TABLE "AppSettings" ALTER COLUMN "id" DROP DEFAULT;

DROP INDEX IF EXISTS "Goal_goalDate_sequence_key";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "Goal_userId_goalDate_sequence_key" ON "Goal"("userId", "goalDate", "sequence");
CREATE INDEX "Goal_userId_goalDate_status_idx" ON "Goal"("userId", "goalDate", "status");
CREATE UNIQUE INDEX "AppSettings_userId_key" ON "AppSettings"("userId");

ALTER TABLE "Goal" ADD CONSTRAINT "Goal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AppSettings" ADD CONSTRAINT "AppSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
