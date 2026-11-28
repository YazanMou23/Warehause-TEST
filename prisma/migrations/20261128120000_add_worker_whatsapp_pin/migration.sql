-- Additive only: WhatsApp worker PIN verification. No existing rows or columns changed.
-- The PIN itself is never stored, only a bcrypt hash. Failed-attempt counter is keyed
-- to a UTC day string (yyyy-mm-dd) so the daily lockout survives restarts.
ALTER TABLE "User" ADD COLUMN "whatsappPinHash" TEXT;
ALTER TABLE "User" ADD COLUMN "whatsappPinFailedAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "whatsappPinFailedDay" TEXT;
