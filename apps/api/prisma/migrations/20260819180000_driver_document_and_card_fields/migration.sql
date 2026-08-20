-- CreateEnum
CREATE TYPE "DriverDocumentKind" AS ENUM ('CEDULA_FRONT', 'CEDULA_BACK', 'LICENSE_FRONT', 'LICENSE_BACK', 'OTHER');

-- AlterTable
ALTER TABLE "Driver"
  ADD COLUMN "country" TEXT,
  ADD COLUMN "nationality" TEXT,
  ADD COLUMN "height" TEXT,
  ADD COLUMN "sex" TEXT,
  ADD COLUMN "birthDate" TEXT,
  ADD COLUMN "bloodType" TEXT,
  ADD COLUMN "birthPlace" TEXT,
  ADD COLUMN "issuePlace" TEXT,
  ADD COLUMN "documentExpirationDate" TEXT,
  ADD COLUMN "supportNumber" TEXT,
  ADD COLUMN "mrz" TEXT,
  ADD COLUMN "licenseIssuingAuthority" TEXT,
  ADD COLUMN "licenseRestrictions" TEXT,
  ADD COLUMN "licenseServiceType" TEXT,
  ADD COLUMN "licenseVehicleClass" TEXT,
  ADD COLUMN "licenseIssueDate" TEXT;

-- CreateTable
CREATE TABLE "DriverDocument" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "uploadedById" TEXT,
    "kind" "DriverDocumentKind" NOT NULL DEFAULT 'OTHER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DriverDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DriverDocument_tenantId_driverId_idx" ON "DriverDocument"("tenantId", "driverId");

-- AddForeignKey
ALTER TABLE "DriverDocument" ADD CONSTRAINT "DriverDocument_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverDocument" ADD CONSTRAINT "DriverDocument_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverDocument" ADD CONSTRAINT "DriverDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
