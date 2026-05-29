"use client";

import { useState } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { Sparkles } from "lucide-react";

import { DataTable } from "@/components/admin/data-table";
import { PageHeader } from "@/components/layout/page-header";
import { StatCard } from "@/components/layout/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingState } from "@/components/ui/loading-state";
import { Select } from "@/components/ui/select";
import { apiClient, useApiMutation, useApiQuery } from "@/hooks/use-api";
import { formatCoverage } from "@/lib/format";

interface ProductionTask {
  id: string;
  filial_id: number;
  lager_id: number;
  lager_name: string | null;
  unit: string | null;
  history_date: string;
  status: "NEW" | "IN_PROGRESS" | "DONE" | "CANCELLED";
  priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  priority_level: number;
  quantity: number;
  covered_hours: number;
  reason: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

interface ProductionTasksResponse {
  generated_at: string;
  count: number;
  tasks: ProductionTask[];
}

interface GenerationSummary {
  created: number;
  updated: number;
  cancelled: number;
  skipped: number;
  unchanged: number;
  total: number;
}

const STATUS_LABELS: Record<ProductionTask["status"], string> = {
  NEW: "Нова",
  IN_PROGRESS: "В роботі",
  DONE: "Виконана",
  CANCELLED: "Скасована"
};

const STATUS_VARIANTS: Record<ProductionTask["status"], "default" | "warning" | "success" | "secondary"> = {
  NEW: "default",
  IN_PROGRESS: "warning",
  DONE: "success",
  CANCELLED: "secondary"
};

const PRIORITY_LABELS: Record<ProductionTask["priority"], string> = {
  CRITICAL: "Критичний",
  HIGH: "Високий",
  MEDIUM: "Середній",
  LOW: "Низький"
};

const PRIORITY_VARIANTS: Record<ProductionTask["priority"], "destructive" | "warning" | "default" | "secondary"> = {
  CRITICAL: "destructive",
  HIGH: "warning",
  MEDIUM: "default",
  LOW: "secondary"
};

const columns: ColumnDef<ProductionTask>[] = [
  {
    accessorKey: "history_date",
    header: "Дата"
  },
  {
    accessorKey: "lager_name",
    header: "Товар",
    cell: ({ row }) => (
      <div className="space-y-0.5">
        <p className="font-medium">{row.original.lager_name ?? "—"}</p>
        <p className="font-mono text-xs text-muted-foreground">SKU {row.original.lager_id}</p>
      </div>
    )
  },
  {
    accessorKey: "priority",
    header: "Пріоритет",
    cell: ({ row }) => (
      <Badge variant={PRIORITY_VARIANTS[row.original.priority]}>
        {PRIORITY_LABELS[row.original.priority]}
      </Badge>
    )
  },
  {
    accessorKey: "quantity",
    header: "До виробництва",
    cell: ({ row }) => (
      <span className="font-semibold">
        {row.original.quantity} {row.original.unit ?? "кг"}
      </span>
    )
  },
  {
    accessorKey: "covered_hours",
    header: "Покриття",
    cell: ({ row }) => formatCoverage(row.original.covered_hours)
  },
  {
    accessorKey: "status",
    header: "Статус",
    cell: ({ row }) => (
      <Badge variant={STATUS_VARIANTS[row.original.status]}>
        {STATUS_LABELS[row.original.status]}
      </Badge>
    )
  },
  {
    accessorKey: "reason",
    header: "Причина",
    cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.reason}</span>
  }
];

export function ProductionTasksManagement() {
  const [filialId, setFilialId] = useState("3322");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");

  const params = new URLSearchParams();
  if (filialId) params.set("filial_id", filialId);
  if (status) params.set("status", status);
  if (priority) params.set("priority", priority);
  const queryString = params.toString();

  const tasksUrl = `/api/production-tasks${queryString ? `?${queryString}` : ""}`;

  const tasksQuery = useApiQuery<ProductionTasksResponse>(
    ["production-tasks", filialId, status, priority],
    tasksUrl
  );

  const generate = useApiMutation<GenerationSummary>({
    mutationFn: () =>
      apiClient<GenerationSummary>(
        `/api/production-tasks/generate${filialId ? `?filial_id=${filialId}` : ""}`,
        { method: "POST" }
      ),
    successMessage: "Задачі згенеровано з прогнозу",
    invalidateKeys: [["production-tasks"]]
  });

  const tasks = tasksQuery.data?.tasks ?? [];

  const activeCount = tasks.filter((t) => t.status === "NEW" || t.status === "IN_PROGRESS").length;
  const criticalCount = tasks.filter((t) => t.priority === "CRITICAL" && t.status !== "CANCELLED").length;
  const totalQuantity = tasks
    .filter((t) => t.status === "NEW" || t.status === "IN_PROGRESS")
    .reduce((sum, t) => sum + t.quantity, 0);

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Production"
        title="Виробничі задачі"
        description="Задачі, створені автоматично з прогнозу виробництва (production plan priority). Кожен новий прогноз через API одразу формує задачі."
        actions={
          <Button onClick={() => generate.mutate()} disabled={generate.isPending}>
            <Sparkles className="mr-2 h-4 w-4" />
            Згенерувати з прогнозу
          </Button>
        }
      />

      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Філія (filial_id)
          </label>
          <input
            type="number"
            value={filialId}
            onChange={(e) => setFilialId(e.target.value)}
            className="flex h-11 rounded-2xl border border-input bg-white px-4 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Статус
          </label>
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Всі статуси</option>
            <option value="NEW">Нова</option>
            <option value="IN_PROGRESS">В роботі</option>
            <option value="DONE">Виконана</option>
            <option value="CANCELLED">Скасована</option>
          </Select>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Пріоритет
          </label>
          <Select value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="">Всі пріоритети</option>
            <option value="CRITICAL">Критичний</option>
            <option value="HIGH">Високий</option>
            <option value="MEDIUM">Середній</option>
            <option value="LOW">Низький</option>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <StatCard title="Активних задач" value={activeCount} />
        <StatCard title="Критичних" value={criticalCount} />
        <StatCard title="Загальний обсяг до виробництва" value={Math.round(totalQuantity * 100) / 100} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Список задач</CardTitle>
          <CardDescription>
            Відсортовано за датою, рівнем пріоритету та годинами покриття запасу.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {tasksQuery.isLoading ? (
            <LoadingState label="Завантаження задач..." />
          ) : (
            <DataTable
              columns={columns}
              data={tasks}
              emptyTitle="Задач ще немає"
              emptyDescription="Задачі з'являться після надходження прогнозу через API або ручної генерації."
            />
          )}
        </CardContent>
      </Card>
    </section>
  );
}
