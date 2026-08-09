-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
