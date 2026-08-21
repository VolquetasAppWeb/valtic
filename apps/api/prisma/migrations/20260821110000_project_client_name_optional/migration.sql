-- El cliente ahora es opcional al crear una obra (flujo de configuracion
-- automatica): se llena si se menciona, la obra se puede crear sin el.
ALTER TABLE "Project" ALTER COLUMN "clientName" DROP NOT NULL;
