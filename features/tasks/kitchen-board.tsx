"use client";

import { Tablet } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingState } from "@/components/ui/loading-state";
import { TaskCard } from "@/components/tablet/task-card";
import { useApiQuery } from "@/hooks/use-api";
import type { TaskDto } from "@/types";

export function KitchenBoard() {
  const tasks = useApiQuery<TaskDto[]>(["tasks", "kitchen"], "/api/tasks?view=kitchen", {
    refetchInterval: 30_000
  });

  if (tasks.isLoading) {
    return <LoadingState label="Завантаження kitchen board..." />;
  }

  return (
    <main className="page-shell min-h-screen space-y-6">
      <PageHeader
        eyebrow="Kitchen tablet"
        title="Виробничі задачі"
        description="Компактний режим для планшета. Картки показують тільки потрібну інформацію і допустимі кнопки."
        actions={
          <div className="flex items-center gap-2 rounded-2xl bg-primary/10 px-4 py-2 text-sm font-semibold text-primary">
            <Tablet className="h-4 w-4" />
            1340x800 optimized
          </div>
        }
      />

      {tasks.data?.length ? (
        <section className="kitchen-grid gap-4">
          {tasks.data.map((task) => (
            <TaskCard key={task.id} task={task} />
          ))}
        </section>
      ) : (
        <EmptyState
          title="Активних задач немає"
          description="Коли алгоритм або адміністратор створить завдання, вони одразу з'являться на tablet board."
        />
      )}
    </main>
  );
}
