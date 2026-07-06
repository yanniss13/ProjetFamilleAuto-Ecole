-- AlterTable
ALTER TABLE "Contract" ADD COLUMN "applicantSignaturePath" TEXT;
ALTER TABLE "Contract" ADD COLUMN "applicantSignedAt" DATETIME;
ALTER TABLE "Contract" ADD COLUMN "proposedPdfHash" TEXT;
ALTER TABLE "Contract" ADD COLUMN "schoolSignaturePath" TEXT;
ALTER TABLE "Contract" ADD COLUMN "schoolSignedAt" DATETIME;
ALTER TABLE "Contract" ADD COLUMN "signedPdfHash" TEXT;
ALTER TABLE "Contract" ADD COLUMN "signedPdfPath" TEXT;

