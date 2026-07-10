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
 *  - work already started/finished (IN_PROGRESS/DONE) is never overwritten;
 *  - otherwise refresh the existing task or create a new one.
 */
export function decideMutation(
  recommendedToProduce: number,
  existingStatus: TaskStatusLiteral | null
): MutationDecision {
  if (recommendedToProduce <= 0) {
    return existingStatus === "NEW" ? "cancel" : "skip";
  }
  if (existingStatus === "IN_PROGRESS" || existingStatus === "DONE") {
    return "unchanged";
  }
  return existingStatus ? "update" : "create";
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
