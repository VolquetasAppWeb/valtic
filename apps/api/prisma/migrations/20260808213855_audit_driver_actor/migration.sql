-- AlterTable
ALTER TABLE "AuditEvent" ADD COLUMN     "actorDriverId" TEXT;

-- CreateIndex
CREATE INDEX "AuditEvent_actorDriverId_idx" ON "AuditEvent"("actorDriverId");

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorDriverId_fkey" FOREIGN KEY ("actorDriverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;
