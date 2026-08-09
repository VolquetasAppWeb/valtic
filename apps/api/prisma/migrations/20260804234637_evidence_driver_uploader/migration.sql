-- DropForeignKey
ALTER TABLE "Evidence" DROP CONSTRAINT "Evidence_uploadedById_fkey";

-- AlterTable
ALTER TABLE "Evidence" ADD COLUMN     "uploadedByDriverId" TEXT,
ALTER COLUMN "uploadedById" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_uploadedByDriverId_fkey" FOREIGN KEY ("uploadedByDriverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;
