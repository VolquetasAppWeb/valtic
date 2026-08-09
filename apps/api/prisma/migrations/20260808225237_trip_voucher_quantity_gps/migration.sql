/*
  Warnings:

  - You are about to drop the column `voucherExtractedValue` on the `Trip` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Trip" DROP COLUMN "voucherExtractedValue",
ADD COLUMN     "voucherCapturedAt" TIMESTAMP(3),
ADD COLUMN     "voucherExtractedQuantity" DECIMAL(10,2),
ADD COLUMN     "voucherExtractedUnit" "CapacityUnit",
ADD COLUMN     "voucherLatitude" DOUBLE PRECISION,
ADD COLUMN     "voucherLongitude" DOUBLE PRECISION,
ADD COLUMN     "voucherNumber" TEXT;
