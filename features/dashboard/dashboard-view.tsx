"use client";

import { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "@/components/admin/data-table";
import { PageHeader } from "@/components/layout/page-header";
import { StatCard } from "@/components/layout/stat-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingState } from "@/components/ui/loading-state";
import { useApiQuery } from "@/hooks/use-api";
import { formatDateTime } from "@/lib/format";
import type { DashboardStats, TaskDto } from "@/types";

const recentTaskColumns: ColumnDef<TaskDto>[] = [
  {
    accessorKey: "title",
    header: "Завдання"
  },
  {
    accessorKey: "branch.name",
    header: "Філія",
    cell: ({ row }) => row.original.branch.name
  },
  {
    accessorKey: "priority",
    header: "Пріоритет",
    cell: ({ row }) => <Badge>{row.original.priority}</Badge>
  },
  {
    accessorKey: "expectedReadyAt",
    header: "Очікувана готовність",
    cell: ({ row }) => formatDateTime(row.original.expectedReadyAt)
  }
];

export function DashboardView() {
  const dashboard = useApiQuery<DashboardStats & { priorities?: Array<{ priority: string; _count: number }> }>(
    ["dashboard"],
    "/api/dashboard"
  );

  if (dashboard.isLoading) {
    return <LoadingState label="Завантаження dashboard..." />;
  }

  if (!dashboard.data) {
    return null;
  }

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Operations overview"
        title="Dashboard"
        description="Оперативна картина по мережі: філії, товари, активні задачі, прострочення і критичні позиції."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Філії" value={dashboard.data.branchesCount} />
        <StatCard title="Товари" value={dashboard.data.productsCount} />
        <StatCard title="Активні задачі" value={dashboard.data.activeTasksCount} />
        <StatCard title="Прострочені задачі" value={dashboard.data.overdueTasksCount} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>Останні задачі</CardTitle>
            <CardDescription>Останні створені та оновлені задачі виробництва.</CardDescription>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={recentTaskColumns}
              data={dashboard.data.recentTasks}
              emptyTitle="Завдань ще немає"
              emptyDescription="Після запуску генератора або ручного створення тут з'являться останні задачі."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Критичні товари</CardTitle>
            <CardDescription>Позиції з найнижчим запасом відносно цільового рівня.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {dashboard.data.criticalProducts.length ? (
              dashboard.data.criticalProducts.map((item) => (
                <div
                  key={`${item.branchName}-${item.productName}`}
                  className="rounded-2xl border border-border/70 bg-muted/30 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{item.productName}</p>
                      <p className="text-sm text-muted-foreground">{item.branchName}</p>
                    </div>
                    <Badge variant={item.currentStock === 0 ? "destructive" : "warning"}>
                      {item.currentStock} / {item.hourlyTargetStock}
                    </Badge>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">Критичних товарів зараз немає.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
