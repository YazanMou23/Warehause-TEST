-- Add upload job idempotency columns to Timesheet
ALTER TABLE "Timesheet" ADD COLUMN "uploadJobId" TEXT;
ALTER TABLE "Timesheet" ADD COLUMN "sourcePage" INTEGER;

-- Idempotency key for page-scoped scans.
-- Rows without an upload job share NULLs; Postgres allows multiple NULLs in a unique index,
-- so existing / non-scan records are unaffected.
CREATE UNIQUE INDEX "Timesheet_uploadJobId_sourcePage_key" ON "Timesheet"("uploadJobId", "sourcePage");