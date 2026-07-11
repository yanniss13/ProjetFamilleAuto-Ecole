-- AlterTable
ALTER TABLE "Application" ADD COLUMN "rejectedAt" DATETIME;

-- CreateTable
CREATE TABLE "PurgeRun" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ranAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unconfirmedAlerts" INTEGER NOT NULL,
    "rejectedApplications" INTEGER NOT NULL,
    "expiredTokens" INTEGER NOT NULL
);
