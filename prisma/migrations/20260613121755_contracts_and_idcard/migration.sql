-- CreateTable
CREATE TABLE "Contract" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "type" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME,
    "motif" TEXT,
    "grossSalary" TEXT NOT NULL,
    "weeklyHours" INTEGER,
    "trialPeriodWeeks" INTEGER,
    "workplace" TEXT NOT NULL,
    "providerSiret" TEXT,
    "schoolAddress" TEXT,
    "applicantAddress" TEXT,
    "extraClauses" TEXT,
    "pdfPath" TEXT NOT NULL,
    "sentToApplicantAt" DATETIME,
    "applicationId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Contract_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Application" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "applicantName" TEXT NOT NULL,
    "applicantEmail" TEXT NOT NULL,
    "applicantPhone" TEXT,
    "message" TEXT NOT NULL,
    "cvPath" TEXT,
    "idCardPath" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "listingId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Application_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Application" ("applicantEmail", "applicantName", "applicantPhone", "createdAt", "cvPath", "id", "listingId", "message") SELECT "applicantEmail", "applicantName", "applicantPhone", "createdAt", "cvPath", "id", "listingId", "message" FROM "Application";
DROP TABLE "Application";
ALTER TABLE "new_Application" RENAME TO "Application";
CREATE INDEX "Application_listingId_idx" ON "Application"("listingId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Contract_applicationId_key" ON "Contract"("applicationId");
