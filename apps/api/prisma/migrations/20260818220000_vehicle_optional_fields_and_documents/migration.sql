-- AlterTable: brand/model/capacity/capacityUnit become optional; add licenseNumber
ALTER TABLE "Vehicle" ALTER COLUMN "brand" DROP NOT NULL;
ALTER TABLE "Vehicle" ALTER COLUMN "model" DROP NOT NULL;
ALTER TABLE "Vehicle" ALTER COLUMN "capacity" DROP NOT NULL;
ALTER TABLE "Vehicle" ALTER COLUMN "capacityUnit" DROP NOT NULL;
ALTER TABLE "Vehicle" ADD COLUMN "licenseNumber" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_tenantId_licenseNumber_key" ON "Vehicle"("tenantId", "licenseNumber");

-- CreateTable
CREATE TABLE "VehicleDocument" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VehicleDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VehicleDocument_tenantId_vehicleId_idx" ON "VehicleDocument"("tenantId", "vehicleId");

-- AddForeignKey
ALTER TABLE "VehicleDocument" ADD CONSTRAINT "VehicleDocument_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleDocument" ADD CONSTRAINT "VehicleDocument_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleDocument" ADD CONSTRAINT "VehicleDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- DataMigration: reformatea placas existentes sin guion (ej. "ABC123") al
-- nuevo formato XXX-111 exigido por el formulario, para que sigan editables.
-- Solo toca filas que calzan exactamente ese patron; el resto queda igual.
UPDATE "Vehicle" SET "plate" = regexp_replace("plate", '^([A-Za-z]{3})(\d{3})$', '\1-\2')
WHERE "plate" ~ '^[A-Za-z]{3}\d{3}$';
