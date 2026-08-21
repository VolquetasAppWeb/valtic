-- Soft-delete para Material (mismo patron que Project/OperationalSite/Rate)
-- — nunca se borra la fila fisicamente, para no romper el historial de
-- viajes/tarifas que la referencian via FK.

-- AlterTable
ALTER TABLE "Material"
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "deletedById" TEXT,
  ADD COLUMN "deleteReason" TEXT;

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "Material_tenantId_deletedAt_idx" ON "Material"("tenantId", "deletedAt");
