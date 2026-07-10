// Pure decision logic for turning forecast rows into production tasks.
// Extracted from the generation service so the ingest hot path is unit-tested
// (tests/task-generation.test.ts) without a database.

export type TaskStatusLiteral = "NEW" | "IN_PROGRESS" | "DONE" | "CANCELLED";
export type TaskPriorityLiteral = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export type MutationDecision = "create" | "update" | "cancel" | "unchanged" | "skip";

export const CANCELLED_BY_COVERAGE_REASON =
  "Завдання скасоване: запас уже покриває попит до кінця дня.";

/**
 * What to do with a forecast row given the task that already exists for it:
 *  - nothing to produce → cancel a NEW task, otherwise skip;
 *  - work in progress is never overwritten;
 *  - finished (DONE) work is kept, unless `reopenDone` says fresh stock data
 *    still shows demand after the completion (see shouldReopenDone);
 *  - otherwise refresh the existing task or create a new one.
 */
export function decideMutation(
  recommendedToProduce: number,
  existingStatus: TaskStatusLiteral | null,
  options?: { reopenDone?: boolean }
): MutationDecision {
  if (recommendedToProduce <= 0) {
    return existingStatus === "NEW" ? "cancel" : "skip";
  }
  if (existingStatus === "IN_PROGRESS") {
    return "unchanged";
  }
  if (existingStatus === "DONE") {
    return options?.reopenDone ? "update" : "unchanged";
  }
  return existingStatus ? "update" : "create";
}

// The app treats forecast hours as Kyiv time (UTC+3), consistently with the
// analytics and export code.
const KYIV_OFFSET_HOURS = 3;

/**
 * The moment the stock snapshot behind a forecast row was taken:
 * `historyDate` (a UTC-midnight DATE) at `snapshotHour` Kyiv time.
 * Returns null when the row carries no snapshot hour.
 */
export function snapshotTimestamp(historyDate: Date, snapshotHour: number | null): Date | null {
  if (snapshotHour == null) return null;
  return new Date(historyDate.getTime() + (snapshotHour - KYIV_OFFSET_HOURS) * 3_600_000);
}

/**
 * A DONE task may be reopened only when the forecast still shows demand AND
 * its stock snapshot was taken AFTER the task was completed — i.e. the shelf
 * was measured empty again once the production had already happened. A
 * forecast built on a snapshot from before the completion must not resurrect
 * just-finished work.
 */
export function shouldReopenDone(
  row: { recommendedToProduce: number; historyDate: Date; snapshotHour: number | null },
  completedAt: Date | null
): boolean {
  if (row.recommendedToProduce <= 0) return false;
  if (!completedAt) return false;
  const snapshot = snapshotTimestamp(row.historyDate, row.snapshotHour);
  if (!snapshot) return false;
  return snapshot.getTime() > completedAt.getTime();
}

interface PriorityMapping {
  priority: TaskPriorityLiteral;
  reason: string;
}

/** Maps the plan urgency level (1-4) to the task priority + explanation. */
export function mapPriorityLevel(level: number): PriorityMapping {
  switch (level) {
    case 1:
      return {
        priority: "CRITICAL",
        reason: "Критичний рівень: поточного запасу вистачить ≤1 год."
      };
    case 2:
      return {
        priority: "HIGH",
        reason: "Попередження: поточного запасу вистачить ≤4 год."
      };
    case 3:
      return {
        priority: "MEDIUM",
        reason: "Помірний рівень: поточного запасу вистачить понад 4 год."
      };
    default:
      return {
        priority: "LOW",
        reason: "Запас покриває попит до кінця дня."
      };
  }
}

/**
 * Operational readiness deadline: forecast receipt time (the plan row's
 * updatedAt) plus covered_hours.
 */
export function operationalReadyAtFor(updatedAt: Date, coveredHours: number): Date {
  return new Date(updatedAt.getTime() + coveredHours * 3_600_000);
}

export interface NamingSources {
  /** V2 lagerfullname supplied by the forecast itself. */
  plan?: string | null;
  /** Value already stored on any task with the same SKU (survives restarts). */
  known?: string | null;
  /** Fresh Silpo lookup result. */
  silpo?: string | null;
  /** Value on the task being refreshed. */
  existing?: string | null;
}

/** Name/unit source preference: plan → known → Silpo → existing. */
export function resolveNaming(sources: NamingSources): string | null {
  return sources.plan ?? sources.known ?? sources.silpo ?? sources.existing ?? null;
}
