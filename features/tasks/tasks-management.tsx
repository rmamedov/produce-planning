"use client";

import Link from "next/link";
import { ColumnDef } from "@tanstack/react-table";
import { useEffect, useState } from "react";

import { DataTable } from "@/components/admin/data-table";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingState } from "@/components/ui/loading-state";
import { TaskDetailContent } from "@/features/tasks/task-detail-content";
import { useApiQuery } from "@/hooks/use-api";
import { formatDateTime, getPriorityLabel, getStatusLabel } from "@/lib/format";
import type { TaskDto } from "@/types";

const columns: ColumnDef<TaskDto>[] = [
  {
    accessorKey: "title",
    header: "Назва"
  },
  {
    accessorKey: "branch.name",
    header: "Філія",
    cell: ({ row }) => row.original.branch.name
  },
  {
    accessorKey: "product.name",
    header: "Товар",
    cell: ({ row }) => row.original.product.name
  },
  {
    accessorKey: "status",
    header: "Статус",
    cell: ({ row }) => <Badge variant="outline">{getStatusLabel(row.original.status)}</Badge>
  },
  {
    accessorKey: "priority",
    header: "Пріоритет",
    cell: ({ row }) => <Badge>{getPriorityLabel(row.original.priority)}</Badge>
  },
  {
    accessorKey: "expectedReadyAt",
    header: "Очікувана готовність",
    cell: ({ row }) => formatDateTime(row.original.expectedReadyAt)
  }
];

export function TasksManagement() {
  const tasks = useApiQuery<TaskDto[]>(["tasks"], "/api/tasks");
  const [selectedTask, setSelectedTask] = useState<TaskDto | null>(null);

  useEffect(() => {
    if (tasks.data?.length) {
      setSelectedTask((current) => current ?? tasks.data[0]);
    } else {
      setSelectedTask(null);
    }
  }, [tasks.data]);

  if (tasks.isLoading) {
    return <LoadingState />;
  }

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Tasks"
        title="Завдання"
        description="Огляд усіх задач виробництва з доступом до детальної технологічної карти."
        actions={
          <Link href="/admin/manual-tasks" className="text-sm font-semibold text-primary">
            Створити ручне завдання
          </Link>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>Список задач</CardTitle>
            <CardDescription>Автоматичні та ручні задачі по всіх філіях.</CardDescription>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={columns}
              data={tasks.data ?? []}
              onRowClick={(row) => setSelectedTask(row)}
              emptyTitle="Задач ще немає"
              emptyDescription="Після запуску генератора або ручного створення тут з'являться production tasks."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Остання задача</CardTitle>
            <CardDescription>Швидкий доступ до деталізації без переходу на kitchen board.</CardDescription>
          </CardHeader>
          <CardContent>
            {selectedTask ? (
              <TaskDetailContent task={selectedTask} />
            ) : (
              <p className="text-sm text-muted-foreground">Для відображення деталізації потрібна хоча б одна задача.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
