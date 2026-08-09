-- AlterTable
ALTER TABLE "Driver" ADD COLUMN     "dispatcherId" TEXT;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "dispatcherId" TEXT;

-- AlterTable
ALTER TABLE "Vehicle" ADD COLUMN     "dispatcherId" TEXT;

-- CreateIndex
CREATE INDEX "Driver_tenantId_dispatcherId_idx" ON "Driver"("tenantId", "dispatcherId");

-- CreateIndex
CREATE INDEX "Project_tenantId_dispatcherId_idx" ON "Project"("tenantId", "dispatcherId");

-- CreateIndex
CREATE INDEX "Vehicle_tenantId_dispatcherId_idx" ON "Vehicle"("tenantId", "dispatcherId");

-- AddForeignKey
ALTER TABLE "Driver" ADD CONSTRAINT "Driver_dispatcherId_fkey" FOREIGN KEY ("dispatcherId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_dispatcherId_fkey" FOREIGN KEY ("dispatcherId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_dispatcherId_fkey" FOREIGN KEY ("dispatcherId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
