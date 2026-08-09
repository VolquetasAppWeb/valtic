-- AlterTable
ALTER TABLE "Driver" ADD COLUMN     "deleteReason" TEXT,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedById" TEXT;

-- CreateIndex
CREATE INDEX "Driver_tenantId_deletedAt_idx" ON "Driver"("tenantId", "deletedAt");

-- AddForeignKey
ALTER TABLE "Driver" ADD CONSTRAINT "Driver_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
