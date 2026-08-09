-- AlterTable
ALTER TABLE "Rate" ADD COLUMN     "dispatcherId" TEXT;

-- CreateIndex
CREATE INDEX "Rate_tenantId_dispatcherId_idx" ON "Rate"("tenantId", "dispatcherId");

-- AddForeignKey
ALTER TABLE "Rate" ADD CONSTRAINT "Rate_dispatcherId_fkey" FOREIGN KEY ("dispatcherId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
