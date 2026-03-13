"use client";

import { useEffect, useRef, useState } from "react";
import { Check, MoreHorizontal, Play, X } from "lucide-react";

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
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (!isMenuOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isMenuOpen]);

  if (!([TaskStatus.NEW, TaskStatus.IN_PROGRESS] as TaskStatus[]).includes(task.status)) {
    return null;
  }

  const primaryAction =
    task.status === TaskStatus.NEW
      ? {
          label: "Почати приготування",
          icon: Play,
          variant: "outline" as const,
          onClick: () => startMutation.mutate()
        }
      : {
          label: "Готово",
          icon: Check,
          variant: "success" as const,
          onClick: () => completeMutation.mutate()
        };

  return (
    <div ref={menuRef} className="relative flex items-stretch gap-2">
      <Button
        className={task.status === TaskStatus.NEW ? "min-w-0 flex-1 border-success text-success hover:bg-success/10 hover:text-success" : "min-w-0 flex-1"}
        size={size}
        variant={primaryAction.variant}
        disabled={isPending}
        onClick={() => {
          setIsMenuOpen(false);
          primaryAction.onClick();
        }}
      >
        <primaryAction.icon className="mr-2 h-4 w-4" />
        {primaryAction.label}
      </Button>

      <div className="shrink-0">
        <Button
          className={compact ? "w-9 px-0" : "w-11 px-0"}
          size={size}
          variant="outline"
          disabled={isPending}
          aria-expanded={isMenuOpen}
          aria-label="Додаткові дії"
          onClick={() => setIsMenuOpen((value) => !value)}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </div>

      {isMenuOpen ? (
        <div className="absolute inset-x-0 top-full z-20 mt-1 rounded-xl border border-border bg-white p-1 shadow-lg">
          <Button
            className="h-7 w-full justify-start text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
            size="sm"
            variant="ghost"
            disabled={isPending}
            onClick={() => {
              setIsMenuOpen(false);
              cancelMutation.mutate();
            }}
          >
            <X className="mr-1.5 h-3.5 w-3.5" />
            Неможливо виготовити
          </Button>
        </div>
      ) : null}
    </div>
  );
}
