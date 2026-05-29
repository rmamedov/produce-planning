// In-process pub/sub so any change to production tasks (ingest, generate,
// start, complete, cancel) is pushed to connected kitchen boards via SSE.
// The app runs as a single Node process, so a module-level Set works across
// requests; it's also stashed on globalThis to survive dev hot-reloads.

export interface ProductionTaskEvent {
  type: "production-tasks-updated";
  reason: string;
  timestamp: string;
}

type Listener = (event: ProductionTaskEvent) => void;

declare global {
  // eslint-disable-next-line no-var
  var __productionTaskListeners: Set<Listener> | undefined;
}

const listeners = globalThis.__productionTaskListeners ?? new Set<Listener>();

if (!globalThis.__productionTaskListeners) {
  globalThis.__productionTaskListeners = listeners;
}

export const productionTaskEvents = {
  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  publish(reason: string) {
    const event: ProductionTaskEvent = {
      type: "production-tasks-updated",
      reason,
      timestamp: new Date().toISOString()
    };

    for (const listener of listeners) {
      listener(event);
    }

    return event;
  }
};
