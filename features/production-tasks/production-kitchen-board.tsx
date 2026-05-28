"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BookOpen, CheckCircle2, Clock3, Package, PlayCircle, Tablet } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingState } from "@/components/ui/loading-state";
import { Select } from "@/components/ui/select";
import { apiClient, useApiMutation, useApiQuery } from "@/hooks/use-api";
import { getPriorityBadgeClassName, getPriorityLabel, getPrioritySurfaceClassName } from "@/lib/format";
import { cn } from "@/lib/utils";

interface ProductionTask {
  id: string;
  filial_id: number;
  lager_id: number;
  lager_name: string | null;
  history_date: string;
  status: "NEW" | "IN_PROGRESS" | "DONE" | "CANCELLED";
  priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  priority_level: number;
  quantity: number;
  covered_hours: number;
  reason: string;
}

interface ProductionTasksResponse {
  generated_at: string;
  count: number;
  tasks: ProductionTask[];
}

const STATUS_LABELS: Record<ProductionTask["status"], string> = {
  NEW: "Нова",
  IN_PROGRESS: "В роботі",
  DONE: "Виконана",
  CANCELLED: "Скасована"
};

function ProductionTaskCard({ task, onChanged }: { task: ProductionTask; onChanged: () => void }) {
  const start = useApiMutation({
    mutationFn: () => apiClient(`/api/production-tasks/${task.id}/start`, { method: "POST" }),
    successMessage: "Задачу взято в роботу",
    onSuccess: onChanged
  });

  const complete = useApiMutation({
    mutationFn: () => apiClient(`/api/production-tasks/${task.id}/complete`, { method: "POST" }),
    successMessage: "Задачу виконано",
    onSuccess: onChanged
  });

  const busy = start.isPending || complete.isPending;

  return (
    <Card className={cn("h-full w-full overflow-hidden shadow-sm", getPrioritySurfaceClassName(task.priority))}>
      <CardContent className="flex h-full flex-col gap-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="line-clamp-2 text-base font-semibold leading-tight">
              {task.lager_name ?? `Lager ${task.lager_id}`}
            </p>
            <p className="text-xs text-muted-foreground">
              SKU {task.lager_id} • Філія {task.filial_id} • {task.history_date}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Badge className={getPriorityBadgeClassName(task.priority)}>{getPriorityLabel(task.priority)}</Badge>
            {task.status === "IN_PROGRESS" ? (
              <Badge variant="warning" className="text-xs">{STATUS_LABELS[task.status]}</Badge>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-sm">
          <Metric label="Виробити" value={`${task.quantity}`} icon={<Package className="h-3.5 w-3.5" />} />
          <Metric label="Покриття" value={`${task.covered_hours} год`} icon={<Clock3 className="h-3.5 w-3.5" />} />
        </div>

        <p className="line-clamp-2 text-xs leading-snug text-muted-foreground">{task.reason}</p>

        <div className="mt-auto flex flex-col gap-2">
          {task.status === "NEW" ? (
            <Button onClick={() => start.mutate()} disabled={busy} className="w-full">
              <PlayCircle className="mr-2 h-4 w-4" />
              Почати
            </Button>
          ) : null}
          {task.status === "IN_PROGRESS" ? (
            <Button onClick={() => complete.mutate()} disabled={busy} className="w-full">
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Завершити
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white/70 px-3 py-2">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide leading-tight text-muted-foreground">
        <span className="shrink-0">{icon}</span>
        <span className="truncate">{label}</span>
      </div>
      <p className="mt-1 text-lg font-bold leading-none">{value}</p>
    </div>
  );
}

export function ProductionKitchenBoard() {
  const [filialFilter, setFilialFilter] = useState("all");

  const query = useApiQuery<ProductionTasksResponse>(
    ["production-tasks", "kitchen"],
    "/api/production-tasks",
    { refetchInterval: 15000 }
  );

  const allTasks = query.data?.tasks ?? [];

  // Kitchen board only shows tasks that still need work.
  const activeTasks = useMemo(
    () => allTasks.filter((task) => task.status === "NEW" || task.status === "IN_PROGRESS"),
    [allTasks]
  );

  const filialOptions = useMemo(
    () => Array.from(new Set(activeTasks.map((task) => task.filial_id))).sort((a, b) => a - b),
    [activeTasks]
  );

  useEffect(() => {
    if (filialFilter !== "all" && !filialOptions.some((id) => String(id) === filialFilter)) {
      setFilialFilter("all");
    }
  }, [filialFilter, filialOptions]);

  const filteredTasks =
    filialFilter === "all"
      ? activeTasks
      : activeTasks.filter((task) => String(task.filial_id) === filialFilter);

  if (query.isLoading) {
    return <LoadingState label="Завантаження kitchen board..." />;
  }

  return (
    <main className="page-shell min-h-screen space-y-6">
      <PageHeader
        eyebrow="Kitchen tablet"
        title="Виробничі задачі"
        description="Компактний режим для планшета. Картки показують тільки потрібну інформацію і допустимі кнопки."
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex min-w-[220px] items-center gap-3 rounded-2xl bg-white/80 px-4 py-2 text-sm">
              <span className="font-semibold text-muted-foreground">Філія</span>
              <Select
                className="h-9 min-w-[150px] border-0 bg-transparent px-0 py-0 font-semibold focus-visible:ring-0 focus-visible:ring-offset-0"
                value={filialFilter}
                onChange={(event) => setFilialFilter(event.target.value)}
              >
                <option value="all">Усі філії</option>
                {filialOptions.map((id) => (
                  <option key={id} value={String(id)}>
                    Філія {id}
                  </option>
                ))}
              </Select>
            </label>

            <div className="flex items-center gap-2 rounded-2xl bg-primary/10 px-4 py-2 text-sm font-semibold text-primary">
              <Tablet className="h-4 w-4" />
              1340x800 optimized
            </div>

            <Link href="/guide" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
              <BookOpen className="mr-2 h-4 w-4" />
              Інструкція
            </Link>
          </div>
        }
      />

      {filteredTasks.length ? (
        <section className="kitchen-grid gap-4">
          {filteredTasks.map((task) => (
            <ProductionTaskCard key={task.id} task={task} onChanged={() => query.refetch()} />
          ))}
        </section>
      ) : (
        <EmptyState
          title={activeTasks.length ? "Для цієї філії активних задач немає" : "Активних задач немає"}
          description={
            activeTasks.length
              ? "Оберіть іншу філію або дочекайтесь нових задач для поточної."
              : "Коли надійде прогноз через API, задачі одразу з'являться на tablet board."
          }
        />
      )}
    </main>
  );
}
