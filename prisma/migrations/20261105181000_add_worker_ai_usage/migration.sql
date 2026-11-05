-- One additive AI accounting table only. Run by owner, never by agent.
CREATE TABLE "WorkerAiUsage" (
    "id" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reservedMicros" INTEGER NOT NULL,
    "actualMicros" INTEGER,
    CONSTRAINT "WorkerAiUsage_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "WorkerAiUsage_reserved_nonnegative" CHECK ("reservedMicros" >= 0),
    CONSTRAINT "WorkerAiUsage_actual_bounded" CHECK ("actualMicros" IS NULL OR ("actualMicros" >= 0 AND "actualMicros" <= "reservedMicros"))
);
CREATE INDEX "WorkerAiUsage_workerId_createdAt_idx" ON "WorkerAiUsage"("workerId", "createdAt");
CREATE INDEX "WorkerAiUsage_createdAt_idx" ON "WorkerAiUsage"("createdAt");
