-- CreateTable
CREATE TABLE "Alert" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "keyword" TEXT,
    "keywordLower" TEXT NOT NULL DEFAULT '',
    "confirmTokenHash" TEXT,
    "confirmedAt" DATETIME,
    "unsubscribeToken" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "Alert_confirmTokenHash_key" ON "Alert"("confirmTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "Alert_unsubscribeToken_key" ON "Alert"("unsubscribeToken");

-- CreateIndex
CREATE INDEX "Alert_department_idx" ON "Alert"("department");

-- CreateIndex
CREATE UNIQUE INDEX "Alert_email_department_keywordLower_key" ON "Alert"("email", "department", "keywordLower");
