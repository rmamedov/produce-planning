"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BookOpen, Tablet } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingState } from "@/components/ui/loading-state";
import { Select } from "@/components/ui/select";
import { TaskCard } from "@/components/tablet/task-card";
import { useApiQuery } from "@/hooks/use-api";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TaskDto } from "@/types";

export function KitchenBoard() {
  const [branchFilter, setBranchFilter] = useState("all");
  const tasks = useApiQuery<TaskDto[]>(["tasks", "kitchen"], "/api/tasks?view=kitchen", {
    refetchInterval: 30_000
  });

  const branchOptions = Array.from(
    new Map((tasks.data ?? []).map((task) => [task.branchId, task.branch])).values()
  ).sort((left, right) => left.name.localeCompare(right.name, "uk"));

  useEffect(() => {
    if (branchFilter !== "all" && !branchOptions.some((branch) => branch.id === branchFilter)) {
      setBranchFilter("all");
    }
  }, [branchFilter, branchOptions]);

  const filteredTasks =
    branchFilter === "all" ? tasks.data ?? [] : (tasks.data ?? []).filter((task) => task.branchId === branchFilter);

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
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex min-w-[220px] items-center gap-3 rounded-2xl bg-white/80 px-4 py-2 text-sm">
              <span className="font-semibold text-muted-foreground">Філія</span>
              <Select
                className="h-9 min-w-[150px] border-0 bg-transparent px-0 py-0 font-semibold focus-visible:ring-0 focus-visible:ring-offset-0"
                value={branchFilter}
                onChange={(event) => setBranchFilter(event.target.value)}
              >
                <option value="all">Усі філії</option>
                {branchOptions.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
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
            <TaskCard key={task.id} task={task} />
          ))}
        </section>
      ) : (
        <EmptyState
          title={tasks.data?.length ? "Для цієї філії активних задач немає" : "Активних задач немає"}
          description={
            tasks.data?.length
              ? "Оберіть іншу філію або дочекайтесь нових задач для поточної."
              : "Коли алгоритм або адміністратор створить завдання, вони одразу з'являться на tablet board."
          }
        />
      )}
    </main>
  );
}
