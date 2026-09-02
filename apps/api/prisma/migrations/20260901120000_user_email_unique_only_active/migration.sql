-- Permite reutilizar el correo de un usuario eliminado (soft-delete): antes
-- el indice unico (tenantId, email) bloqueaba crear un usuario nuevo con el
-- mismo correo de uno ya eliminado, aunque el chequeo de la aplicacion ya
-- ignorara los eliminados. Se reemplaza por un indice unico PARCIAL que
-- solo aplica a usuarios activos (deletedAt IS NULL) — el usuario eliminado
-- conserva su correo original intacto para el historial de "Ver eliminados".
DROP INDEX "User_tenantId_email_key";

CREATE UNIQUE INDEX "User_tenantId_email_active_key" ON "User"("tenantId", "email") WHERE "deletedAt" IS NULL;
