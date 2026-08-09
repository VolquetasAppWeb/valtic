import {
  LayoutDashboard,
  Users,
  UserCog,
  Building2,
  Truck,
  HardHat,
  MapPin,
  Package,
  Receipt,
  Route,
  Radar,
  AlertTriangle,
  Wallet,
  ShieldCheck,
  BarChart3,
} from "lucide-react";
import { PERMISSIONS, type PermissionKey } from "@valtic/types";

export interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  permission?: PermissionKey | PermissionKey[];
}

// `permission` decide si el item aparece para el usuario actual (any-of si
// es un arreglo); sin `permission`, el item es visible para cualquier
// usuario administrativo autenticado. Este es el unico lugar donde se
// decide que ve cada rol en la navegacion — las paginas en si no repiten
// esta logica. Compartido entre el sidebar de escritorio y el menu movil.
export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/drivers", label: "Conductores", icon: Users, permission: [PERMISSIONS.DRIVERS_MANAGE, PERMISSIONS.DRIVERS_READ] },
  { href: "/vehicles", label: "Vehiculos", icon: Truck, permission: [PERMISSIONS.VEHICLES_MANAGE, PERMISSIONS.VEHICLES_READ] },
  { href: "/projects", label: "Obras", icon: HardHat, permission: [PERMISSIONS.PROJECTS_MANAGE, PERMISSIONS.PROJECTS_READ] },
  { href: "/operational-sites", label: "Puntos operativos", icon: MapPin, permission: [PERMISSIONS.SITES_MANAGE, PERMISSIONS.SITES_READ] },
  { href: "/trips", label: "Viajes", icon: Route, permission: PERMISSIONS.TRIPS_READ },
  { href: "/monitor", label: "Monitor en vivo", icon: Radar, permission: PERMISSIONS.TRIPS_READ },
  { href: "/incidents", label: "Novedades", icon: AlertTriangle, permission: PERMISSIONS.INCIDENTS_READ },
  { href: "/reports", label: "Reportes", icon: BarChart3, permission: PERMISSIONS.REPORTS_READ },
  // Solo TENANT_ADMIN: catalogos y configuracion compartida del tenant
  // (no son "datos propios" de un dispatcher), liquidaciones y auditoria.
  { href: "/users", label: "Usuarios", icon: UserCog, permission: PERMISSIONS.USERS_MANAGE },
  { href: "/fleet-owners", label: "Propietarios", icon: Building2, permission: PERMISSIONS.FLEET_OWNERS_MANAGE },
  { href: "/materials", label: "Materiales", icon: Package, permission: PERMISSIONS.MATERIALS_MANAGE },
  { href: "/rates", label: "Tarifas", icon: Receipt, permission: PERMISSIONS.RATES_MANAGE },
  {
    href: "/settlements",
    label: "Liquidaciones",
    icon: Wallet,
    permission: [PERMISSIONS.SETTLEMENTS_MANAGE, PERMISSIONS.SETTLEMENTS_READ_OWN],
  },
  { href: "/audit", label: "Auditoria", icon: ShieldCheck, permission: [PERMISSIONS.AUDIT_READ, PERMISSIONS.AUDIT_READ_GLOBAL] },
];
