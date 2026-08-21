-- Soft-delete para Project, OperationalSite y Rate (mismo patron que Driver
-- y Vehicle) — nunca se borra la fila fisicamente, para no romper el
-- historial de viajes que las referencian via FK.

-- AlterTable
ALTER TABLE "Project"
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "deletedById" TEXT,
  ADD COLUMN "deleteReason" TEXT;

-- AlterTable
ALTER TABLE "OperationalSite"
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "deletedById" TEXT,
  ADD COLUMN "deleteReason" TEXT;

-- AlterTable
ALTER TABLE "Rate"
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "deletedById" TEXT,
  ADD COLUMN "deleteReason" TEXT;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationalSite" ADD CONSTRAINT "OperationalSite_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rate" ADD CONSTRAINT "Rate_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "Project_tenantId_deletedAt_idx" ON "Project"("tenantId", "deletedAt");

-- CreateIndex
CREATE INDEX "OperationalSite_tenantId_deletedAt_idx" ON "OperationalSite"("tenantId", "deletedAt");

-- CreateIndex
CREATE INDEX "Rate_tenantId_deletedAt_idx" ON "Rate"("tenantId", "deletedAt");
