"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { LoadingState } from "@/components/ui/loading-state";
import { TaskDetailContent } from "@/features/tasks/task-detail-content";
import { useApiQuery } from "@/hooks/use-api";
import { useTaskRealtime } from "@/hooks/use-task-realtime";
import { cn } from "@/lib/utils";
import type { TaskDto } from "@/types";

export function TaskDetailView({ taskId }: { taskId: string }) {
  const task = useApiQuery<TaskDto>(["task", taskId], `/api/tasks/${taskId}`);

  useTaskRealtime(taskId);

  if (task.isLoading) {
    return <LoadingState label="Завантаження деталей задачі..." />;
  }

  if (!task.data) {
    return null;
  }

  return (
    <main className="page-shell min-h-screen space-y-6">
      <PageHeader
        eyebrow="Kitchen task detail"
        title={task.data.title}
        description="Повна інформація по товару, технологічна карта та статусні дії."
        actions={
          <Link href="/kitchen" className={cn(buttonVariants({ variant: "outline" }))}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Назад до списку
          </Link>
        }
      />
      <TaskDetailContent task={task.data} />
    </main>
  );
}
