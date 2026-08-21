export interface Material {
  id: string;
  name: string;
  code: string;
  unit: string;
  status: "ACTIVE" | "INACTIVE";
}

export interface FleetOwner {
  id: string;
  userId: string | null;
  type: "NATURAL_PERSON" | "LEGAL_ENTITY";
  documentNumber: string;
  name: string;
  phone: string;
  email: string | null;
  bankName: string | null;
  bankAccountType: string | null;
  bankAccountLastFour: string | null;
  status: "ACTIVE" | "INACTIVE";
  dispatcherId: string | null;
  dispatcher: { id: string; firstName: string; lastName: string } | null;
  _count?: { vehicles: number };
}

export interface DriverVehicleAssignmentRef {
  id: string;
  active: boolean;
  vehicle?: { id: string; plate: string };
  driver?: { id: string; firstName: string; lastName: string };
}

// Resto de campos de cedula/licencia — todos texto libre y opcionales,
// vienen de OCR best-effort. Compartido entre Driver y CedulaExtraction.
export interface DriverCardFields {
  country: string | null;
  nationality: string | null;
  height: string | null;
  sex: string | null;
  birthDate: string | null;
  bloodType: string | null;
  birthPlace: string | null;
  issuePlace: string | null;
  documentExpirationDate: string | null;
  supportNumber: string | null;
  mrz: string | null;
  licenseIssuingAuthority: string | null;
  licenseRestrictions: string | null;
  licenseIssueDate: string | null;
}

// Una fila de la tabla "CATEGORIAS AUTORIZADAS" de la licencia — cada
// categoria tiene su propia clase de vehiculo, vigencia y servicio.
export interface DriverLicenseCategoryEntry {
  category: string | null;
  vehicleClass: string | null;
  expiration: string | null;
  serviceType: string | null;
}

export interface Driver extends DriverCardFields {
  id: string;
  documentType: "CC" | "CE" | "PASSPORT" | "NIT";
  documentNumber: string;
  firstName: string;
  lastName: string;
  licenseNumber: string;
  licenseCategory: string | null;
  licenseExpiration: string;
  licenseCategories: DriverLicenseCategoryEntry[] | null;
  status: "ACTIVE" | "INACTIVE" | "SUSPENDED";
  lastLoginAt: string | null;
  assignments?: DriverVehicleAssignmentRef[];
}

// Solo la respuesta de POST /drivers trae el PIN en texto plano — es una
// revelacion unica, no se puede volver a consultar despues.
export interface CreatedDriver extends Driver {
  pin: string;
}

export interface CedulaExtraction {
  documentType: string | null;
  country: string | null;
  documentNumber: string | null;
  lastName: string | null;
  firstName: string | null;
  nationality: string | null;
  height: string | null;
  sex: string | null;
  birthDate: string | null;
  bloodType: string | null;
  birthPlace: string | null;
  issuePlace: string | null;
  documentExpirationDate: string | null;
  supportNumber: string | null;
  mrz: string | null;
}

// "documentNumber" y "fullName" (frente) se usan para comparar contra la
// cedula y avisar si no coinciden — no autocompletan el formulario.
export interface DriverLicenseExtraction {
  country: string | null;
  documentType: string | null;
  licenseNumber: string | null;
  licenseBarcode: string | null;
  fullName: string | null;
  documentNumber: string | null;
  birthDate: string | null;
  issueDate: string | null;
  bloodType: string | null;
  restrictions: string | null;
  issuingAuthority: string | null;
  categories: DriverLicenseCategoryEntry[];
}

export type DriverDocumentKind = "CEDULA_FRONT" | "CEDULA_BACK" | "LICENSE_FRONT" | "LICENSE_BACK" | "OTHER";

export interface DriverDocument {
  id: string;
  driverId: string;
  fileUrl: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  kind: DriverDocumentKind;
  createdAt: string;
  uploadedBy: { id: string; firstName: string; lastName: string } | null;
}

export interface DeletedDriver extends Driver {
  deletedAt: string;
  deleteReason: string | null;
  dispatcher: { id: string; firstName: string; lastName: string } | null;
  deletedBy: { id: string; firstName: string; lastName: string } | null;
}

// Resto de campos de la tarjeta de propiedad (frente y reverso), aparte de
// plate/brand/model(linea)/year/licenseNumber que ya existian. Todos texto
// libre y opcionales — vienen de OCR best-effort.
export interface VehicleRegistrationCardFields {
  country: string | null;
  licenseBarcode: string | null;
  cc: string | null;
  color: string | null;
  serviceType: string | null;
  vehicleClass: string | null;
  bodyType: string | null;
  fuelType: string | null;
  loadCapacity: string | null;
  engineNumber: string | null;
  serialNumber: string | null;
  vin: string | null;
  chassisNumber: string | null;
  ownerName: string | null;
  ownerDocumentNumber: string | null;
  mobilityRestriction: string | null;
  armor: string | null;
  horsepower: string | null;
  importDeclaration: string | null;
  importDate: string | null;
  doors: string | null;
  propertyLimitation: string | null;
  registrationDate: string | null;
  licenseIssueDate: string | null;
  licenseExpirationDate: string | null;
  transitAuthority: string | null;
}

export interface Vehicle extends VehicleRegistrationCardFields {
  id: string;
  fleetOwnerId: string;
  plate: string;
  vehicleType: "DUMP_TRUCK" | "DOUBLE_TRAILER" | "MINI_DUMP_TRUCK" | "TRACTOR_TRAILER" | "OTHER";
  brand: string | null;
  model: string | null;
  year: number;
  capacity: string | null;
  capacityUnit: "TON" | "CUBIC_METER" | null;
  licenseNumber: string | null;
  status: "ACTIVE" | "MAINTENANCE" | "INACTIVE";
  fleetOwner?: { id: string; name: string };
  assignments?: DriverVehicleAssignmentRef[];
}

export type VehicleDocumentKind = "REGISTRATION_FRONT" | "REGISTRATION_BACK" | "VEHICLE_PHOTO" | "OTHER";

export interface VehicleDocument {
  id: string;
  vehicleId: string;
  fileUrl: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  kind: VehicleDocumentKind;
  createdAt: string;
  uploadedBy: { id: string; firstName: string; lastName: string } | null;
}

export interface VehicleRegistrationExtraction extends VehicleRegistrationCardFields {
  plate: string | null;
  brand: string | null;
  line: string | null;
  modelYear: string | null;
  licenseNumber: string | null;
}

export interface DeletedVehicle extends Vehicle {
  deletedAt: string;
  deleteReason: string | null;
  dispatcher: { id: string; firstName: string; lastName: string } | null;
  deletedBy: { id: string; firstName: string; lastName: string } | null;
}

export interface Project {
  id: string;
  name: string;
  code: string;
  description: string | null;
  clientName: string | null;
  status: "PLANNED" | "ACTIVE" | "PAUSED" | "CLOSED";
  startDate: string;
  endDate: string | null;
  _count?: { operationalSites: number };
}

export interface OperationalSite {
  id: string;
  projectId: string;
  name: string;
  type: "LOAD" | "UNLOAD" | "BOTH";
  address: string;
  latitude: number;
  longitude: number;
  geofenceRadius: number;
  status: "ACTIVE" | "INACTIVE";
  project?: { id: string; name: string };
}

export interface Rate {
  id: string;
  projectId: string;
  originSiteId: string;
  destinationSiteId: string;
  materialId: string;
  fleetOwnerId: string | null;
  rateType: "PER_TRIP" | "PER_TON" | "PER_CUBIC_METER" | "PER_KILOMETER" | "FIXED";
  value: string;
  currency: string;
  validFrom: string;
  validUntil: string | null;
  status: "ACTIVE" | "EXPIRED" | "INACTIVE";
  project?: { id: string; name: string };
  originSite?: { id: string; name: string };
  destinationSite?: { id: string; name: string };
  material?: { id: string; name: string };
  fleetOwner?: { id: string; name: string } | null;
  dispatcherId: string | null;
  dispatcher?: { id: string; firstName: string; lastName: string } | null;
}

// Borrador de "Obra + Puntos operativos + Tarifas" leido por IA de una
// orden de trabajo/cotizacion — se revisa/edita en pantalla antes de crear
// nada (ver POST /operations/extract-setup y /operations/quick-setup).
export interface OperationsSetupDraft {
  // Sin name/code: la obra no tiene nombre propio en este flujo — se
  // genera del lado del cliente a partir de los puntos de cargue/descargue.
  project: {
    clientName: string | null;
    description: string | null;
    startDate: string | null;
    endDate: string | null;
  };
  sites: Array<{ name: string | null; type: "LOAD" | "UNLOAD" | "BOTH" | null; address: string | null }>;
  rates: Array<{
    originSiteName: string | null;
    destinationSiteName: string | null;
    materialName: string | null;
    rateType: "PER_TRIP" | "PER_TON" | "PER_CUBIC_METER" | "PER_KILOMETER" | "FIXED" | null;
    value: number | null;
    vehicleType: "DUMP_TRUCK" | "DOUBLE_TRAILER" | "MINI_DUMP_TRUCK" | "TRACTOR_TRAILER" | "OTHER" | null;
  }>;
}

export type TripStatus =
  | "DRAFT"
  | "ASSIGNED"
  | "ACCEPTED"
  | "EN_ROUTE_TO_LOAD"
  | "LOADING"
  | "LOADED"
  | "EN_ROUTE_TO_UNLOAD"
  | "UNLOADING"
  | "PENDING_VALIDATION"
  | "COMPLETED"
  | "INCLUDED_IN_SETTLEMENT"
  | "SETTLED"
  | "UNDER_REVIEW"
  | "BLOCKED_BY_INCIDENT"
  | "MANUALLY_CLOSED"
  | "CANCELLED"
  | "REJECTED";

export interface TripEvent {
  id: string;
  type: string;
  source: string;
  payload: Record<string, unknown>;
  previousHash: string | null;
  eventHash: string;
  occurredAt: string;
  createdAt: string;
}

export interface Trip {
  id: string;
  sequentialNumber: number;
  status: TripStatus;
  estimatedQuantity: string | null;
  actualQuantity: string | null;
  quantityUnit: "TON" | "CUBIC_METER" | null;
  rateSnapshot: { rateId: string; rateType: string; value: string; currency: string } | null;
  assignedAt: string | null;
  acceptedAt: string | null;
  startedAt: string | null;
  loadedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  voucherImageUrl: string | null;
  voucherRawText: string | null;
  voucherNumber: string | null;
  voucherExtractedQuantity: string | null;
  voucherExtractedUnit: "TON" | "CUBIC_METER" | null;
  voucherExtractedFields: Record<string, string> | null;
  voucherCapturedAt: string | null;
  voucherLatitude: number | null;
  voucherLongitude: number | null;
  voucherUploadedAt: string | null;
  createdAt: string;
  driver: { id: string; firstName: string; lastName: string; documentNumber: string };
  vehicle: { id: string; plate: string; vehicleType: string; capacity: string | null; capacityUnit: string | null };
  fleetOwner: { id: string; name: string };
  project: { id: string; name: string; code: string };
  originSite: { id: string; name: string; address: string; latitude: number; longitude: number; geofenceRadius: number };
  destinationSite: { id: string; name: string; address: string; latitude: number; longitude: number; geofenceRadius: number };
  material: { id: string; name: string; unit: string };
  events?: TripEvent[];
}

export type IncidentType =
  | "MECHANICAL_FAILURE"
  | "TRAFFIC_ACCIDENT"
  | "DELAY"
  | "WEATHER"
  | "SECURITY"
  | "CARGO_ISSUE"
  | "ROAD_CLOSURE"
  | "OTHER";

export type IncidentSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type IncidentStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "DISMISSED";

export interface Evidence {
  id: string;
  type: "PHOTO" | "DOCUMENT" | "OTHER";
  fileUrl: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  createdAt: string;
}

export interface Incident {
  id: string;
  type: IncidentType;
  severity: IncidentSeverity;
  status: IncidentStatus;
  description: string;
  latitude: number | null;
  longitude: number | null;
  reportedAt: string;
  resolvedAt: string | null;
  resolutionNotes: string | null;
  driver: { id: string; firstName: string; lastName: string; documentNumber: string };
  vehicle: { id: string; plate: string } | null;
  trip: { id: string; sequentialNumber: number; status: string } | null;
  resolvedBy: { id: string; firstName: string; lastName: string } | null;
  evidences: Evidence[];
}

export interface PaginatedResult<T> {
  data: T[];
  meta: { page: number; pageSize: number; totalItems: number; totalPages: number };
}

export type SettlementStatus = "DRAFT" | "APPROVED" | "PAID" | "CANCELLED";
export type AdjustmentType = "BONUS" | "DEDUCTION" | "CORRECTION";

export interface SettlementItem {
  id: string;
  tripId: string;
  rateType: string;
  quantity: string;
  unitValue: string;
  total: string;
  trip: {
    id: string;
    sequentialNumber: number;
    completedAt: string | null;
    project: { name: string };
    originSite: { name: string };
    destinationSite: { name: string };
    material: { name: string };
    vehicle: { plate: string };
  };
}

export interface SettlementAdjustment {
  id: string;
  type: AdjustmentType;
  description: string;
  amount: string;
  createdBy: { id: string; firstName: string; lastName: string };
}

export interface Settlement {
  id: string;
  sequentialNumber: number;
  status: SettlementStatus;
  periodStart: string;
  periodEnd: string;
  subtotal: string;
  adjustmentsTotal: string;
  total: string;
  currency: string;
  fleetOwner: { id: string; name: string; documentNumber?: string };
  approvedBy: { id: string; firstName: string; lastName: string } | null;
  items: SettlementItem[];
  adjustments: SettlementAdjustment[];
}

export interface SettlementPreviewItem {
  id: string;
  sequentialNumber: number;
  completedAt: string | null;
  project: string;
  route: string;
  material: string;
  item: {
    tripId: string;
    rateType: string;
    quantity: number;
    unitValue: number;
    total: number;
  };
}

export interface SettlementPreview {
  fleetOwner: { id: string; name: string };
  trips: SettlementPreviewItem[];
  subtotal: number;
  tripCount: number;
}

export interface DashboardReport {
  activeTrips: number;
  completedToday: number;
  pendingReview: number;
  openIncidents: number;
  activeVehicles: number;
  availableDrivers: number;
  settledValuePeriod: number;
  currency: string;
  tripsByDay: Array<{ date: string; completed: number }>;
}

export interface SettlementsByOwnerReport {
  fleetOwnerId: string;
  fleetOwnerName: string;
  settlementCount: number;
  totalValue: number;
}

export interface TripsByProjectReport {
  projectId: string;
  projectName: string;
  completedTrips: number;
}

export interface AdminUser {
  id: string;
  tenantId: string | null;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  status: "ACTIVE" | "INACTIVE";
  lastLoginAt: string | null;
  createdAt: string;
  userRoles: Array<{ role: { id: string; name: string } }>;
}

export interface AuditEvent {
  id: string;
  tenantId: string | null;
  actorUserId: string | null;
  actorDriverId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  oldValue: unknown;
  newValue: unknown;
  reason: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  actor: { id: string; firstName: string; lastName: string; email: string } | null;
  actorDriver: { id: string; firstName: string; lastName: string; documentNumber: string } | null;
  tenant: { id: string; name: string } | null;
}

export interface LocationPoint {
  id: string;
  tripId: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  altitude: number | null;
  speed: number | null;
  heading: number | null;
  capturedAt: string;
}
