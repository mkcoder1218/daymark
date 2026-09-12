ALTER TABLE "Goal" RENAME COLUMN "goalDate" TO "setDate";

DROP INDEX IF EXISTS "Goal_goalDate_sequence_key";
DROP INDEX IF EXISTS "Goal_goalDate_status_idx";
DROP INDEX IF EXISTS "Goal_userId_goalDate_sequence_key";
DROP INDEX IF EXISTS "Goal_userId_goalDate_status_idx";

WITH ranked AS (
    SELECT
        "id",
        ROW_NUMBER() OVER (
            PARTITION BY "userId"
            ORDER BY "setDate" ASC, "sequence" ASC, "createdAt" ASC, "id" ASC
        ) AS "newSequence"
    FROM "Goal"
)
UPDATE "Goal" AS goal
SET "sequence" = ranked."newSequence"
FROM ranked
WHERE goal."id" = ranked."id";

CREATE UNIQUE INDEX "Goal_userId_sequence_key" ON "Goal"("userId", "sequence");
CREATE INDEX "Goal_userId_status_sequence_idx" ON "Goal"("userId", "status", "sequence");
CREATE INDEX "Goal_setDate_idx" ON "Goal"("setDate");
