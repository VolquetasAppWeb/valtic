-- CreateEnum
CREATE TYPE "VehicleDocumentKind" AS ENUM ('REGISTRATION_FRONT', 'REGISTRATION_BACK', 'VEHICLE_PHOTO', 'OTHER');

-- AlterTable
ALTER TABLE "VehicleDocument" ADD COLUMN "kind" "VehicleDocumentKind" NOT NULL DEFAULT 'OTHER';
