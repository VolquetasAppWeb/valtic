-- Permite que dos DISPATCHER distintos registren el mismo vehiculo real
-- (misma placa o mismo numero de licencia de transito) cada uno en su propia
-- cuenta, sin chocar entre si. El caso de dos vehiculos creados por un
-- TENANT_ADMIN (dispatcherId NULL) sigue revalidandose a mano en
-- VehiclesService.create, ya que Postgres no considera dos NULL iguales
-- para efectos de un unique constraint.

DROP INDEX "Vehicle_tenantId_plate_key";
DROP INDEX "Vehicle_tenantId_licenseNumber_key";

CREATE UNIQUE INDEX "Vehicle_tenantId_dispatcherId_plate_key" ON "Vehicle"("tenantId", "dispatcherId", "plate");
CREATE UNIQUE INDEX "Vehicle_tenantId_dispatcherId_licenseNumber_key" ON "Vehicle"("tenantId", "dispatcherId", "licenseNumber");
