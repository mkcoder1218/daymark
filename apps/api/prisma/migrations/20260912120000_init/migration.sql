CREATE TYPE "GoalStatus" AS ENUM ('PLANNED', 'ACTIVE', 'COMPLETED');
CREATE TYPE "ActivityType" AS ENUM ('FOCUS', 'BREAK', 'DISTRACTION', 'SWITCH');

CREATE TABLE "Goal" (
    "id" TEXT NOT NULL,
    "goalDate" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "note" TEXT,
    "status" "GoalStatus" NOT NULL DEFAULT 'PLANNED',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Goal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "type" "ActivityType" NOT NULL,
    "reason" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AppSettings" (
    "id" TEXT NOT NULL DEFAULT 'primary',
    "telegramEnabled" BOOLEAN NOT NULL DEFAULT false,
    "telegramBotTokenEncrypted" TEXT,
    "telegramChatId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AppSettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Goal_goalDate_key" ON "Goal"("goalDate");
CREATE INDEX "Goal_createdAt_idx" ON "Goal"("createdAt");
CREATE INDEX "Activity_goalId_startedAt_idx" ON "Activity"("goalId", "startedAt");
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
