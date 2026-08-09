-- AlterTable
ALTER TABLE "Trip" ADD COLUMN     "voucherExtractedValue" DECIMAL(14,2),
ADD COLUMN     "voucherImageUrl" TEXT,
ADD COLUMN     "voucherRawText" TEXT,
ADD COLUMN     "voucherUploadedAt" TIMESTAMP(3);
