-- CreateTable
CREATE TABLE "School" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "siret" TEXT NOT NULL,
    "phone" TEXT,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "verifyTokenHash" TEXT,
    "verifyTokenExpiry" DATETIME,
    "resetTokenHash" TEXT,
    "resetTokenExpiry" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Listing" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "contractType" TEXT,
    "city" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "hoursPerWeek" INTEGER,
    "compensation" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "schoolId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Listing_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Application" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "applicantName" TEXT NOT NULL,
    "applicantEmail" TEXT NOT NULL,
    "applicantPhone" TEXT,
    "message" TEXT NOT NULL,
    "cvPath" TEXT,
    "listingId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Application_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "School_email_key" ON "School"("email");

-- CreateIndex
CREATE UNIQUE INDEX "School_siret_key" ON "School"("siret");

-- CreateIndex
CREATE UNIQUE INDEX "School_verifyTokenHash_key" ON "School"("verifyTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "School_resetTokenHash_key" ON "School"("resetTokenHash");

-- CreateIndex
CREATE INDEX "Listing_department_idx" ON "Listing"("department");

-- CreateIndex
CREATE INDEX "Listing_status_idx" ON "Listing"("status");

-- CreateIndex
CREATE INDEX "Application_listingId_idx" ON "Application"("listingId");
