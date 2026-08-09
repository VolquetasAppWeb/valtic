-- AlterTable
ALTER TABLE "FleetOwner" ADD COLUMN     "dispatcherId" TEXT;

-- CreateIndex
CREATE INDEX "FleetOwner_tenantId_dispatcherId_idx" ON "FleetOwner"("tenantId", "dispatcherId");

-- AddForeignKey
ALTER TABLE "FleetOwner" ADD CONSTRAINT "FleetOwner_dispatcherId_fkey" FOREIGN KEY ("dispatcherId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
