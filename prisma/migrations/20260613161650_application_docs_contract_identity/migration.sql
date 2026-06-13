-- AlterTable
ALTER TABLE "Application" ADD COLUMN "licensePath" TEXT;
ALTER TABLE "Application" ADD COLUMN "teachingCardPath" TEXT;

-- AlterTable
ALTER TABLE "Contract" ADD COLUMN "birthDate" DATETIME;
ALTER TABLE "Contract" ADD COLUMN "birthPlace" TEXT;
ALTER TABLE "Contract" ADD COLUMN "licenseCategories" TEXT;
ALTER TABLE "Contract" ADD COLUMN "licenseNumber" TEXT;
ALTER TABLE "Contract" ADD COLUMN "nationality" TEXT;
ALTER TABLE "Contract" ADD COLUMN "teachingAuthNumber" TEXT;
ALTER TABLE "Contract" ADD COLUMN "teachingAuthValidUntil" DATETIME;
