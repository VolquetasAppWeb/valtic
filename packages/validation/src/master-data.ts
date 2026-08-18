import { z } from "zod";

export const materialSchema = z.object({
  name: z.string().min(2, "Minimo 2 caracteres"),
  code: z.string().min(1, "Requerido"),
  unit: z.string().min(1, "Requerido"),
});
export type MaterialInput = z.infer<typeof materialSchema>;

export const fleetOwnerSchema = z.object({
  type: z.enum(["NATURAL_PERSON", "LEGAL_ENTITY"]),
  documentNumber: z.string().min(3, "Requerido"),
  name: z.string().min(2, "Minimo 2 caracteres"),
  phone: z.string().min(7, "Telefono invalido"),
  email: z.string().email("Correo invalido").optional().or(z.literal("")),
  bankName: z.string().optional().or(z.literal("")),
  bankAccountType: z.string().optional().or(z.literal("")),
  bankAccountLastFour: z.string().optional().or(z.literal("")),
});
export type FleetOwnerInput = z.infer<typeof fleetOwnerSchema>;

export const driverSchema = z.object({
  documentType: z.enum(["CC", "CE", "PASSPORT", "NIT"]),
  documentNumber: z.string().min(4, "Documento invalido"),
  firstName: z.string().min(2, "Minimo 2 caracteres"),
  lastName: z.string().min(2, "Minimo 2 caracteres"),
  phone: z.string().min(7, "Telefono invalido"),
  licenseNumber: z.string().min(2, "Requerido"),
  licenseExpiration: z.string().min(1, "Requerido"),
  pin: z
    .string()
    .length(6, "El PIN debe tener 6 digitos")
    .regex(/^\d{6}$/, "Solo numeros"),
});
export type DriverInput = z.infer<typeof driverSchema>;

export const driverUpdateSchema = driverSchema.omit({ pin: true });
export type DriverUpdateInput = z.infer<typeof driverUpdateSchema>;

export const vehicleSchema = z.object({
  // Opcional: si el actor es DISPATCHER y se deja vacio, el backend usa
  // automaticamente su propio propietario. Para TENANT_ADMIN la pagina
  // exige seleccionarlo en la UI antes de enviar.
  fleetOwnerId: z.string().uuid("Selecciona un propietario").optional().or(z.literal("")),
  plate: z
    .string()
    .regex(/^[A-Za-z]{3}-\d{3}$/, "Formato de placa invalido. Usa XXX-111 (3 letras, guion, 3 numeros)."),
  vehicleType: z.enum(["DUMP_TRUCK", "DOUBLE_TRAILER", "MINI_DUMP_TRUCK", "TRACTOR_TRAILER", "OTHER"]),
  brand: z.string().optional().or(z.literal("")),
  model: z.string().optional().or(z.literal("")),
  year: z.coerce.number().int().min(1970).max(2100),
  capacity: z.coerce.number().min(0).optional(),
  capacityUnit: z.enum(["TON", "CUBIC_METER"]).optional().or(z.literal("")),
  licenseNumber: z.string().optional().or(z.literal("")),
});
export type VehicleInput = z.infer<typeof vehicleSchema>;

export const projectSchema = z.object({
  name: z.string().min(2, "Minimo 2 caracteres"),
  code: z.string().min(1, "Requerido"),
  description: z.string().optional().or(z.literal("")),
  clientName: z.string().min(2, "Minimo 2 caracteres"),
  startDate: z.string().min(1, "Requerido"),
  endDate: z.string().optional().or(z.literal("")),
});
export type ProjectInput = z.infer<typeof projectSchema>;

export const operationalSiteSchema = z.object({
  projectId: z.string().uuid("Selecciona una obra"),
  name: z.string().min(2, "Minimo 2 caracteres"),
  type: z.enum(["LOAD", "UNLOAD", "BOTH"]),
  address: z.string().min(3, "Requerido"),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  geofenceRadius: z.coerce.number().int().min(10).max(2000),
});
export type OperationalSiteInput = z.infer<typeof operationalSiteSchema>;

export const rateSchema = z.object({
  projectId: z.string().uuid("Selecciona una obra"),
  originSiteId: z.string().uuid("Selecciona el origen"),
  destinationSiteId: z.string().uuid("Selecciona el destino"),
  materialId: z.string().uuid("Selecciona un material"),
  fleetOwnerId: z.string().optional().or(z.literal("")),
  rateType: z.enum(["PER_TRIP", "PER_TON", "PER_CUBIC_METER", "PER_KILOMETER", "FIXED"]),
  value: z.coerce.number().min(0),
  validFrom: z.string().min(1, "Requerido"),
  validUntil: z.string().optional().or(z.literal("")),
});
export type RateInput = z.infer<typeof rateSchema>;

export const createTripSchema = z.object({
  projectId: z.string().uuid("Selecciona una obra"),
  driverId: z.string().uuid("Selecciona un conductor"),
  vehicleId: z.string().uuid("Selecciona un vehiculo"),
  originSiteId: z.string().uuid("Selecciona el origen"),
  destinationSiteId: z.string().uuid("Selecciona el destino"),
  materialId: z.string().uuid("Selecciona un material"),
  estimatedQuantity: z.coerce.number().min(0).optional(),
  quantityUnit: z.enum(["TON", "CUBIC_METER"]).optional(),
});
export type CreateTripInput = z.infer<typeof createTripSchema>;

export const cancelTripSchema = z.object({
  reason: z.string().min(5, "El motivo debe tener minimo 5 caracteres"),
});
export type CancelTripInput = z.infer<typeof cancelTripSchema>;

export const settlementPeriodSchema = z.object({
  fleetOwnerId: z.string().uuid("Selecciona un propietario"),
  periodStart: z.string().min(1, "Requerido"),
  periodEnd: z.string().min(1, "Requerido"),
});
export type SettlementPeriodInput = z.infer<typeof settlementPeriodSchema>;

export const createAdjustmentSchema = z.object({
  type: z.enum(["BONUS", "DEDUCTION", "CORRECTION"]),
  description: z.string().min(3, "Minimo 3 caracteres"),
  amount: z.coerce.number().positive("Debe ser mayor a cero"),
});
export type CreateAdjustmentInput = z.infer<typeof createAdjustmentSchema>;
