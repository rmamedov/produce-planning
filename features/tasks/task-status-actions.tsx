"use client";

import { Check, Play, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useApiMutation } from "@/hooks/use-api";
import { apiClient } from "@/hooks/use-api";
import { TaskStatus } from "@/domain/enums";
import type { TaskDto } from "@/types";

export function TaskStatusActions({
  task,
  compact = false
}: {
  task: Pick<TaskDto, "id" | "status">;
  compact?: boolean;
}) {
  const startMutation = useApiMutation({
    mutationFn: () =>
      apiClient(`/api/tasks/${task.id}/start`, {
        method: "POST"
      }),
    successMessage: "Завдання переведено в роботу",
    invalidateKeys: [["tasks"], ["dashboard"], ["task", task.id]]
  });

  const completeMutation = useApiMutation({
    mutationFn: () =>
      apiClient(`/api/tasks/${task.id}/complete`, {
        method: "POST"
      }),
    successMessage: "Завдання завершено",
    invalidateKeys: [["tasks"], ["dashboard"], ["task", task.id]]
  });

  const cancelMutation = useApiMutation({
    mutationFn: () =>
      apiClient(`/api/tasks/${task.id}/cancel`, {
        method: "POST"
      }),
    successMessage: "Завдання скасовано",
    invalidateKeys: [["tasks"], ["dashboard"], ["task", task.id]]
  });

  const size = compact ? "sm" : "default";
  const isPending = startMutation.isPending || completeMutation.isPending || cancelMutation.isPending;

  if (task.status === TaskStatus.NEW) {
    return (
      <Button className="w-full" size={size} variant="success" disabled={isPending} onClick={() => startMutation.mutate()}>
        <Play className="mr-2 h-4 w-4" />
        Почати виконання
      </Button>
    );
  }

  if (task.status === TaskStatus.IN_PROGRESS) {
    return (
      <div className="grid gap-2">
        <Button className="w-full" size={size} variant="success" disabled={isPending} onClick={() => completeMutation.mutate()}>
          <Check className="mr-2 h-4 w-4" />
          Готово
        </Button>
        <Button className="w-full" size={size} variant="destructive" disabled={isPending} onClick={() => cancelMutation.mutate()}>
          <X className="mr-2 h-4 w-4" />
          Неможливо виготовити
        </Button>
      </div>
    );
  }

  return null;
}
