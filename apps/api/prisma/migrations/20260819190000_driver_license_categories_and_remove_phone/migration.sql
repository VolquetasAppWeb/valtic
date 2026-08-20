-- AlterTable
ALTER TABLE "Driver"
  DROP COLUMN "phone",
  DROP COLUMN "licenseServiceType",
  DROP COLUMN "licenseVehicleClass",
  ADD COLUMN "licenseCategories" JSONB;
