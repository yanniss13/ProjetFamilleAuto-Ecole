-- CreateTable
CREATE TABLE "Admin" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_School" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "siret" TEXT NOT NULL,
    "phone" TEXT,
    "suspended" BOOLEAN NOT NULL DEFAULT false,
    "address" TEXT,
    "latitude" REAL,
    "longitude" REAL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "verifyTokenHash" TEXT,
    "verifyTokenExpiry" DATETIME,
    "resetTokenHash" TEXT,
    "resetTokenExpiry" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_School" ("address", "businessName", "createdAt", "email", "emailVerified", "id", "latitude", "longitude", "passwordHash", "phone", "resetTokenExpiry", "resetTokenHash", "siret", "updatedAt", "verifyTokenExpiry", "verifyTokenHash") SELECT "address", "businessName", "createdAt", "email", "emailVerified", "id", "latitude", "longitude", "passwordHash", "phone", "resetTokenExpiry", "resetTokenHash", "siret", "updatedAt", "verifyTokenExpiry", "verifyTokenHash" FROM "School";
DROP TABLE "School";
ALTER TABLE "new_School" RENAME TO "School";
CREATE UNIQUE INDEX "School_email_key" ON "School"("email");
CREATE UNIQUE INDEX "School_siret_key" ON "School"("siret");
CREATE UNIQUE INDEX "School_verifyTokenHash_key" ON "School"("verifyTokenHash");
CREATE UNIQUE INDEX "School_resetTokenHash_key" ON "School"("resetTokenHash");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Admin_email_key" ON "Admin"("email");

