"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import type { TaskRealtimeEvent } from "@/types";

export function useTaskRealtime(taskId?: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (typeof window === "undefined" || typeof EventSource === "undefined") {
      return undefined;
    }

    const stream = new EventSource("/api/tasks/stream");
    let hasOpened = false;

    const refreshActiveQueries = () => {
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });

      if (taskId) {
        void queryClient.invalidateQueries({ queryKey: ["task", taskId] });
      }
    };

    const handleUpdate = (event: Event) => {
      const message = event as MessageEvent<string>;

      try {
        JSON.parse(message.data) as TaskRealtimeEvent;
      } catch {
        return;
      }

      refreshActiveQueries();
    };

    const handleOpen = () => {
      if (hasOpened) {
        refreshActiveQueries();
      }

      hasOpened = true;
    };

    stream.addEventListener("tasks-updated", handleUpdate);
    stream.addEventListener("open", handleOpen);

    return () => {
      stream.removeEventListener("tasks-updated", handleUpdate);
      stream.removeEventListener("open", handleOpen);
      stream.close();
    };
  }, [queryClient, taskId]);
}
