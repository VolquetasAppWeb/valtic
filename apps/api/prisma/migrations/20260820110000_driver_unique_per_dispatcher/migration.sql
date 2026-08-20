-- Permite que dos DISPATCHER distintos registren el mismo conductor real
-- (mismo numero de documento) cada uno en su propia cuenta, sin chocar entre
-- si — mismo patron que 20260820100000_vehicle_unique_per_dispatcher. El
-- caso de dos conductores creados por un TENANT_ADMIN (dispatcherId NULL)
-- sigue revalidandose a mano en DriversService.create.

DROP INDEX "Driver_tenantId_documentNumber_key";

CREATE UNIQUE INDEX "Driver_tenantId_dispatcherId_documentNumber_key" ON "Driver"("tenantId", "dispatcherId", "documentNumber");
