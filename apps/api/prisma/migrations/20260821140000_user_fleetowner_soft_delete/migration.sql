-- Soft-delete para User y FleetOwner (mismo patron que Driver/Vehicle/
-- Project/OperationalSite/Rate/Material) — nunca se borra la fila
-- fisicamente, para no romper el historial (viajes, tarifas, liquidaciones,
-- auditoria) que las referencian via FK. deletedById en User es
-- auto-referencial: otro usuario del mismo tenant elimino a este.

-- AlterTable
ALTER TABLE "User"
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "deletedById" TEXT,
  ADD COLUMN "deleteReason" TEXT;

-- AlterTable
ALTER TABLE "FleetOwner"
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "deletedById" TEXT,
  ADD COLUMN "deleteReason" TEXT;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FleetOwner" ADD CONSTRAINT "FleetOwner_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "User_tenantId_deletedAt_idx" ON "User"("tenantId", "deletedAt");

-- CreateIndex
CREATE INDEX "FleetOwner_tenantId_deletedAt_idx" ON "FleetOwner"("tenantId", "deletedAt");
