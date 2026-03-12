import type { TaskRealtimeEvent, TaskRealtimeReason } from "@/types";

type TaskRealtimeListener = (event: TaskRealtimeEvent) => void;

declare global {
  var __taskRealtimeListeners: Set<TaskRealtimeListener> | undefined;
}

const listeners = globalThis.__taskRealtimeListeners ?? new Set<TaskRealtimeListener>();

if (!globalThis.__taskRealtimeListeners) {
  globalThis.__taskRealtimeListeners = listeners;
}

type PublishTaskUpdateInput = {
  reason: TaskRealtimeReason;
  branchId?: string;
  productId?: string;
  taskId?: string | null;
};

export const taskRealtimeService = {
  subscribe(listener: TaskRealtimeListener) {
    listeners.add(listener);

    return () => {
      listeners.delete(listener);
    };
  },

  publishTaskUpdate(input: PublishTaskUpdateInput) {
    const event: TaskRealtimeEvent = {
      type: "tasks-updated",
      reason: input.reason,
      timestamp: new Date().toISOString(),
      branchId: input.branchId,
      productId: input.productId,
      taskId: input.taskId ?? undefined
    };

    for (const listener of listeners) {
      listener(event);
    }

    return event;
  }
};
