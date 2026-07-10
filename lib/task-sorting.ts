// Pure ordering logic for the kitchen board, unit-tested in
// tests/task-sorting.test.ts.

// LOW is displayed as "Нормальний" just like MEDIUM, so both share a rank —
// consistent with the priority filter, where MEDIUM also covers LOW.
const PRIORITY_RANK: Record<string, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 2
};

/** Criticality rank: lower sorts first. Unknown values go last. */
export function priorityRank(priority: string): number {
  return PRIORITY_RANK[priority] ?? 3;
}

/** Readiness deadline as epoch ms; tasks without one sort last. */
export function readinessTime(operationalReadyAt: string | null): number {
  if (!operationalReadyAt) return Number.POSITIVE_INFINITY;
  const time = new Date(operationalReadyAt).getTime();
  return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time;
}

export interface SortableTask {
  priority: string;
  operational_ready_at: string | null;
}

/**
 * Board ordering. With no specific priority filter ("all"): group by
 * criticality (Критичні → Високі → Нормальні), inside each group the nearest
 * (and overdue) readiness deadlines first. With a concrete priority selected
 * the groups would be redundant, so tasks order purely by readiness.
 */
export function sortKitchenTasks<T extends SortableTask>(
  tasks: T[],
  selectedPriority: string
): T[] {
  const groupByPriority = selectedPriority === "all";
  return [...tasks].sort((a, b) => {
    if (groupByPriority) {
      const rankDiff = priorityRank(a.priority) - priorityRank(b.priority);
      if (rankDiff !== 0) return rankDiff;
    }
    return readinessTime(a.operational_ready_at) - readinessTime(b.operational_ready_at);
  });
}
