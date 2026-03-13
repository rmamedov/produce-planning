"use client";

import { useState } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { Download } from "lucide-react";

import { DataTable } from "@/components/admin/data-table";
import { PageHeader } from "@/components/layout/page-header";
import { StatCard } from "@/components/layout/stat-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingState } from "@/components/ui/loading-state";
import { Select } from "@/components/ui/select";
import { useApiQuery } from "@/hooks/use-api";

interface BranchOption {
  id: string;
  name: string;
}

interface BranchAnalytics {
  branchId: string;
  branchName: string;
  totalTasks: number;
  completedTasks: number;
  avgCompletionMinutes: number;
  onTimeRate: number;
}

interface AnalyticsResponse {
  branches: BranchAnalytics[];
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)} хв`;
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return mins > 0 ? `${hours} год ${mins} хв` : `${hours} год`;
}

const branchColumns: ColumnDef<BranchAnalytics>[] = [
  {
    accessorKey: "branchName",
    header: "Філія"
  },
  {
    accessorKey: "totalTasks",
    header: "Всього задач"
  },
  {
    accessorKey: "completedTasks",
    header: "Виконано"
  },
  {
    accessorKey: "avgCompletionMinutes",
    header: "Середній час",
    cell: ({ row }) => formatMinutes(row.original.avgCompletionMinutes)
  },
  {
    accessorKey: "onTimeRate",
    header: "Своєчасність",
    cell: ({ row }) => {
      const rate = row.original.onTimeRate;
      return (
        <Badge variant={rate >= 0.8 ? "success" : rate >= 0.5 ? "warning" : "destructive"}>
          {Math.round(rate * 100)}%
        </Badge>
      );
    }
  }
];

export function AnalyticsDashboard() {
  const [branchId, setBranchId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const params = new URLSearchParams();
  if (branchId) params.set("branchId", branchId);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const queryString = params.toString();

  const analyticsUrl = `/api/task-analytics${queryString ? `?${queryString}` : ""}`;

  const branches = useApiQuery<BranchOption[]>(["branches"], "/api/branches");
  const analytics = useApiQuery<AnalyticsResponse>(
    ["task-analytics", branchId, from, to],
    analyticsUrl
  );

  const data = analytics.data?.branches ?? [];

  const filteredData = branchId ? data.filter((b) => b.branchId === branchId) : data;

  const totalTasks = filteredData.reduce((sum, b) => sum + b.totalTasks, 0);
  const totalCompleted = filteredData.reduce((sum, b) => sum + b.completedTasks, 0);

  const avgMinutes =
    filteredData.length > 0
      ? filteredData.reduce((sum, b) => sum + b.avgCompletionMinutes * b.completedTasks, 0) /
        Math.max(totalCompleted, 1)
      : 0;

  const avgOnTimeRate =
    totalCompleted > 0
      ? filteredData.reduce((sum, b) => sum + b.onTimeRate * b.completedTasks, 0) / totalCompleted
      : 0;

  function handleExport() {
    const exportParams = new URLSearchParams();
    if (branchId) exportParams.set("branchId", branchId);
    if (from) exportParams.set("from", from);
    if (to) exportParams.set("to", to);
    const qs = exportParams.toString();
    window.open(`/api/task-logs/export${qs ? `?${qs}` : ""}`, "_blank");
  }

  if (analytics.isLoading) {
    return <LoadingState label="Завантаження аналітики..." />;
  }

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Analytics"
        title="Аналітика завдань"
        description="Продуктивність філій, середній час виконання та своєчасність задач виробництва."
        actions={
          <button
            onClick={handleExport}
            className="inline-flex items-center gap-2 rounded-2xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90"
          >
            <Download className="h-4 w-4" />
            Експорт CSV
          </button>
        }
      />

      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Філія
          </label>
          <Select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            <option value="">Всі філії</option>
            {(branches.data ?? []).map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Від
          </label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="flex h-11 rounded-2xl border border-input bg-white px-4 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            До
          </label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="flex h-11 rounded-2xl border border-input bg-white px-4 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <StatCard title="Всього задач" value={totalTasks} />
        <StatCard title="Середній час виконання" value={formatMinutes(avgMinutes)} />
        <StatCard title="Своєчасність" value={`${Math.round(avgOnTimeRate * 100)}%`} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Статистика по філіях</CardTitle>
          <CardDescription>Деталізація продуктивності кожної філії за обраний період.</CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={branchColumns}
            data={filteredData}
            emptyTitle="Даних ще немає"
            emptyDescription="Аналітика з'явиться після створення та виконання задач виробництва."
          />
        </CardContent>
      </Card>
    </section>
  );
}
