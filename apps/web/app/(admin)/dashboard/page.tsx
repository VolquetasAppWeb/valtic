"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { apiClient } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth-store";
import type { DashboardReport } from "@/lib/api-types";

const currencyFormatter = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

const DAYS_OPTIONS = [
  { value: 7, label: "Ultimos 7 dias" },
  { value: 14, label: "Ultimos 14 dias" },
  { value: 30, label: "Ultimos 30 dias" },
  { value: 90, label: "Ultimos 90 dias" },
];

export default function DashboardPage(): JSX.Element {
  const isTenantAdmin = useAuthStore((state) => state.user?.roles.includes("TENANT_ADMIN") ?? false);
  const [days, setDays] = useState(14);

  const { data, isLoading } = useQuery({
    queryKey: ["reports", "dashboard", days],
    queryFn: () => apiClient.get<DashboardReport>(`/reports/dashboard?days=${days}`),
    refetchInterval: 30_000,
  });

  const kpis = data
    ? [
        { label: isTenantAdmin ? "Viajes activos" : "Mis viajes activos", value: data.activeTrips.toString() },
        { label: "Completados hoy", value: data.completedToday.toString() },
        { label: "Pendientes de revision", value: data.pendingReview.toString() },
        { label: isTenantAdmin ? "Novedades abiertas" : "Mis novedades abiertas", value: data.openIncidents.toString() },
        { label: isTenantAdmin ? "Vehiculos activos" : "Mis vehiculos activos", value: data.activeVehicles.toString() },
        {
          label: isTenantAdmin ? "Conductores disponibles" : "Mis conductores disponibles",
          value: data.availableDrivers.toString(),
        },
        { label: "Valor liquidado del periodo", value: currencyFormatter.format(data.settledValuePeriod) },
      ]
    : [];

  const chartData = (data?.tripsByDay ?? []).map((d) => ({
    date: new Date(`${d.date}T00:00:00Z`).toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit" }),
    completed: d.completed,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          {isTenantAdmin
            ? "Vision general de la operacion, actualizada cada 30 segundos."
            : "Vision general de tu operacion (tus conductores, vehiculos y obras), actualizada cada 30 segundos."}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {isLoading || !data
          ? Array.from({ length: 7 }).map((_, i) => (
              <Card key={i}>
                <CardHeader className="pb-2">
                  <Skeleton className="h-4 w-24" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-16" />
                </CardContent>
              </Card>
            ))
          : kpis.map((kpi) => (
              <Card key={kpi.label}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">{kpi.label}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-semibold">{kpi.value}</p>
                </CardContent>
              </Card>
            ))}
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Viajes completados por dia</CardTitle>
          <Select value={String(days)} onValueChange={(value) => setDays(Number(value))}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DAYS_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={String(option.value)}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {isLoading || !data ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    borderColor: "hsl(var(--border))",
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="completed" name="Completados" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
