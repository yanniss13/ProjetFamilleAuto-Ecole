-- AlterTable
ALTER TABLE "Listing" ADD COLUMN "cityLower" TEXT;
ALTER TABLE "Listing" ADD COLUMN "descriptionLower" TEXT;
ALTER TABLE "Listing" ADD COLUMN "titleLower" TEXT;

-- Backfill des lignes existantes (portable SQLite/PostgreSQL).
UPDATE "Listing" SET "titleLower" = lower("title"), "descriptionLower" = lower("description"), "cityLower" = lower("city");
