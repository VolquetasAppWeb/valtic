"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart3 } from "lucide-react";
import { PERMISSIONS } from "@valtic/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { apiClient } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/hooks/use-permissions";
import type { SettlementsByOwnerReport, TripsByProjectReport } from "@/lib/api-types";

const currencyFormatter = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });

function firstDayOfMonth(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function ReportsPage(): JSX.Element {
  const { has } = usePermissions();
  const canSeeSettlements = has(PERMISSIONS.SETTLEMENTS_MANAGE);

  const [periodStart, setPeriodStart] = useState(firstDayOfMonth());
  const [periodEnd, setPeriodEnd] = useState(today());
  const [appliedStart, setAppliedStart] = useState(periodStart);
  const [appliedEnd, setAppliedEnd] = useState(periodEnd);

  const { data: byOwner, isLoading: loadingOwner } = useQuery({
    queryKey: ["reports", "settlements-by-owner", appliedStart, appliedEnd],
    queryFn: () =>
      apiClient.get<SettlementsByOwnerReport[]>(
        `/reports/settlements-by-owner?periodStart=${appliedStart}&periodEnd=${appliedEnd}`,
      ),
    enabled: canSeeSettlements,
    refetchInterval: 30_000,
  });

  const { data: byProject, isLoading: loadingProject } = useQuery({
    queryKey: ["reports", "trips-by-project", appliedStart, appliedEnd],
    queryFn: () =>
      apiClient.get<TripsByProjectReport[]>(`/reports/trips-by-project?periodStart=${appliedStart}&periodEnd=${appliedEnd}`),
    refetchInterval: 30_000,
  });

  const ownerChartData = (byOwner ?? []).map((o) => ({ name: o.fleetOwnerName, total: o.totalValue }));
  const projectChartData = (byProject ?? []).map((p) => ({ name: p.projectName, trips: p.completedTrips }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reportes</h1>
        <p className="text-sm text-muted-foreground">
          {canSeeSettlements
            ? "Liquidado por propietario y viajes completados por obra, en un periodo."
            : "Viajes completados por tus obras, en un periodo."}
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="periodStart">Desde</Label>
          <Input id="periodStart" type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="periodEnd">Hasta</Label>
          <Input id="periodEnd" type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
        </div>
        <Button
          variant="outline"
          onClick={() => {
            setAppliedStart(periodStart);
            setAppliedEnd(periodEnd);
          }}
        >
          Aplicar
        </Button>
      </div>

      <div className={cn("grid grid-cols-1 gap-6", canSeeSettlements && "lg:grid-cols-2")}>
        {canSeeSettlements && (
          <Card>
            <CardHeader>
              <CardTitle>Liquidado por propietario</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {loadingOwner ? (
                <Skeleton className="h-64 w-full" />
              ) : !byOwner || byOwner.length === 0 ? (
                <EmptyState icon={BarChart3} title="Sin liquidaciones aprobadas" description="No hay liquidaciones aprobadas en el periodo seleccionado." />
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={ownerChartData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip
                        formatter={(value: number) => currencyFormatter.format(value)}
                        contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", fontSize: 12 }}
                      />
                      <Bar dataKey="total" name="Total liquidado" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Propietario</TableHead>
                        <TableHead>Liquidaciones</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {byOwner.map((row) => (
                        <TableRow key={row.fleetOwnerId}>
                          <TableCell className="font-medium">{row.fleetOwnerName}</TableCell>
                          <TableCell className="text-muted-foreground">{row.settlementCount}</TableCell>
                          <TableCell className="text-right">{currencyFormatter.format(row.totalValue)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Viajes completados por obra</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {loadingProject ? (
              <Skeleton className="h-64 w-full" />
            ) : !byProject || byProject.length === 0 ? (
              <EmptyState icon={BarChart3} title="Sin viajes completados" description="No hay viajes completados en el periodo seleccionado." />
            ) : (
              <>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={projectChartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", fontSize: 12 }} />
                    <Bar dataKey="trips" name="Viajes" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Obra</TableHead>
                      <TableHead className="text-right">Viajes completados</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {byProject.map((row) => (
                      <TableRow key={row.projectId}>
                        <TableCell className="font-medium">{row.projectName}</TableCell>
                        <TableCell className="text-right">{row.completedTrips}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
