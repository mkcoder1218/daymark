ALTER TABLE "Goal" ADD COLUMN "sequence" INTEGER;

UPDATE "Goal" SET "sequence" = 1 WHERE "sequence" IS NULL;

ALTER TABLE "Goal" ALTER COLUMN "sequence" SET NOT NULL;

DROP INDEX IF EXISTS "Goal_goalDate_key";

CREATE UNIQUE INDEX "Goal_goalDate_sequence_key" ON "Goal"("goalDate", "sequence");
CREATE INDEX "Goal_goalDate_status_idx" ON "Goal"("goalDate", "status");
