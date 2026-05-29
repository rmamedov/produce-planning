"use client";

import { useMemo } from "react";
import { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "@/components/admin/data-table";
import { PageHeader } from "@/components/layout/page-header";
import { StatCard } from "@/components/layout/stat-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingState } from "@/components/ui/loading-state";
import { useApiQuery } from "@/hooks/use-api";

interface SegmentMetrics {
  total: number;
  active: number;
  done: number;
  cancelled: number;
  completed_pct: number;
  on_time_now_pct: number;
  avg_completion_minutes: number;
}

interface FilialRow extends SegmentMetrics {
  filial_id: number;
  filial_name: string;
}

interface DepartmentRow extends SegmentMetrics {
  department_id: number;
  department_name: string;
}

interface HourlyRow {
  hour: number;
  task_count: number;
  completed_count: number;
  on_time_pct: number | null;
}

interface AnalyticsResponse {
  generated_at: string;
  overall: SegmentMetrics;
  by_filial: FilialRow[];
  by_department: DepartmentRow[];
  hourly: HourlyRow[];
}

function formatMinutes(minutes: number): string {
  if (!minutes) return "—";
  if (minutes < 60) return `${minutes} хв`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} год ${m} хв` : `${h} год`;
}

function pctVariant(pct: number): "success" | "warning" | "destructive" {
  return pct >= 80 ? "success" : pct >= 50 ? "warning" : "destructive";
}

const segmentColumns = <T extends SegmentMetrics>(
  firstKey: keyof T,
  firstHeader: string
): ColumnDef<T>[] => [
  { accessorKey: firstKey as string, header: firstHeader },
  { accessorKey: "active", header: "Зараз" },
  { accessorKey: "total", header: "Всього" },
  {
    id: "completed",
    header: "Виконано",
    cell: ({ row }) => (
      <Badge variant={pctVariant(row.original.completed_pct)}>{row.original.completed_pct}%</Badge>
    )
  },
  {
    id: "ontime",
    header: "Своєчасність зараз",
    cell: ({ row }) => (
      <Badge variant={pctVariant(row.original.on_time_now_pct)}>{row.original.on_time_now_pct}%</Badge>
    )
  },
  {
    id: "avg",
    header: "Середній час",
    cell: ({ row }) => formatMinutes(row.original.avg_completion_minutes)
  }
];

const hourlyColumns: ColumnDef<HourlyRow>[] = [
  {
    accessorKey: "hour",
    header: "Година",
    cell: ({ row }) => `${String(row.original.hour).padStart(2, "0")}:00`
  },
  { accessorKey: "task_count", header: "Задач створено" },
  { accessorKey: "completed_count", header: "Виконано" },
  {
    id: "ontime",
    header: "Своєчасність",
    cell: ({ row }) =>
      row.original.on_time_pct === null ? (
        <span className="text-muted-foreground">—</span>
      ) : (
        <Badge variant={pctVariant(row.original.on_time_pct)}>{row.original.on_time_pct}%</Badge>
      )
  }
];

export function AnalyticsDashboard() {
  const analytics = useApiQuery<AnalyticsResponse>(["production-analytics"], "/api/production-analytics", {
    refetchInterval: 30000
  });

  const filialCols = useMemo(() => segmentColumns<FilialRow>("filial_name", "Філія"), []);
  const departmentCols = useMemo(() => segmentColumns<DepartmentRow>("department_name", "Відділ"), []);

  if (analytics.isLoading) {
    return <LoadingState label="Завантаження аналітики..." />;
  }

  const data = analytics.data;
  const overall = data?.overall;
  const hourlyActive = (data?.hourly ?? []).filter((h) => h.task_count > 0 || h.completed_count > 0);

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Analytics"
        title="Аналітика виробничих задач"
        description="Поточні та історичні показники в розрізі філій, відділів і годин: завантаження, своєчасність, час виконання."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Активних задач зараз" value={overall?.active ?? 0} />
        <StatCard title="Виконано" value={`${overall?.completed_pct ?? 0}%`} />
        <StatCard title="Своєчасність зараз" value={`${overall?.on_time_now_pct ?? 0}%`} />
        <StatCard title="Середній час виконання" value={formatMinutes(overall?.avg_completion_minutes ?? 0)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>У розрізі філій</CardTitle>
          <CardDescription>Завантаження, своєчасність і час виконання по кожній філії.</CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={filialCols}
            data={data?.by_filial ?? []}
            emptyTitle="Даних ще немає"
            emptyDescription="Показники з'являться після створення та виконання задач."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>У розрізі відділів</CardTitle>
          <CardDescription>Ті ж показники по кожному відділу (Кулінарія, Пекарня тощо).</CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={departmentCols}
            data={data?.by_department ?? []}
            emptyTitle="Даних ще немає"
            emptyDescription="Показники з'являться після надходження прогнозів із відділами."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>По годинах</CardTitle>
          <CardDescription>
            Кількість задач у кожну годину та своєчасність виготовлення (за київським часом).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={hourlyColumns}
            data={hourlyActive}
            emptyTitle="Даних ще немає"
            emptyDescription="Погодинна статистика з'явиться після появи задач."
          />
        </CardContent>
      </Card>
    </section>
  );
}
