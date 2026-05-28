import type { ProductionPlanPriority } from "@prisma/client";
import { TaskPriority, TaskStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";

interface PriorityMapping {
  priority: TaskPriority;
  reason: string;
}

/**
 * Maps the production plan urgency level (1-4) onto the internal task priority
 * enum and a human-readable explanation (Ukrainian, matching the rest of the app).
 */
function mapPriorityLevel(level: number): PriorityMapping {
  switch (level) {
    case 1:
      return {
        priority: TaskPriority.CRITICAL,
        reason: "Критичний рівень: поточного запасу вистачить ≤1 год."
      };
    case 2:
      return {
        priority: TaskPriority.HIGH,
        reason: "Попередження: поточного запасу вистачить ≤4 год."
      };
    case 3:
      return {
        priority: TaskPriority.MEDIUM,
        reason: "Помірний рівень: поточного запасу вистачить понад 4 год."
      };
    default:
      return {
        priority: TaskPriority.LOW,
        reason: "Запас покриває попит до кінця дня."
      };
  }
}

export interface GenerationSummary {
  created: number;
  updated: number;
  cancelled: number;
  skipped: number;
  unchanged: number;
  total: number;
}

async function generateForRow(row: ProductionPlanPriority, summary: GenerationSummary) {
  summary.total += 1;

  const existing = await prisma.productionTask.findUnique({
    where: { sourceId: row.id }
  });

  // Nothing to produce — no task needed.
  if (row.recommendedToProduce <= 0) {
    if (existing && existing.status === TaskStatus.NEW) {
      await prisma.productionTask.update({
        where: { id: existing.id },
        data: {
          status: TaskStatus.CANCELLED,
          quantity: row.recommendedToProduce,
          reason: "Завдання скасоване: запас уже покриває попит до кінця дня."
        }
      });
      summary.cancelled += 1;
      return;
    }

    summary.skipped += 1;
    return;
  }

  const { priority, reason } = mapPriorityLevel(row.priority);

  // Never overwrite work that is already in progress or finished.
  if (existing && (existing.status === TaskStatus.IN_PROGRESS || existing.status === TaskStatus.DONE)) {
    summary.unchanged += 1;
    return;
  }

  if (existing) {
    await prisma.productionTask.update({
      where: { id: existing.id },
      data: {
        status: TaskStatus.NEW,
        priority,
        priorityLevel: row.priority,
        quantity: row.recommendedToProduce,
        coveredHours: row.coveredHours,
        reason
      }
    });
    summary.updated += 1;
    return;
  }

  await prisma.productionTask.create({
    data: {
      sourceId: row.id,
      filialId: row.filialId,
      lagerId: row.lagerId,
      historyDate: row.historyDate,
      status: TaskStatus.NEW,
      priority,
      priorityLevel: row.priority,
      quantity: row.recommendedToProduce,
      coveredHours: row.coveredHours,
      reason
    }
  });
  summary.created += 1;
}

export const productionTaskGenerationService = {
  /**
   * Generates (or refreshes) production tasks from the stored production plan
   * priority rows. Optionally scoped to a single filial.
   */
  async generate(filialId?: number): Promise<GenerationSummary> {
    const rows = await prisma.productionPlanPriority.findMany({
      where: filialId ? { filialId } : undefined,
      orderBy: [{ historyDate: "asc" }, { priority: "asc" }, { coveredHours: "asc" }]
    });

    return this.generateForRows(rows);
  },

  /**
   * Generates (or refreshes) production tasks for an explicit set of plan rows.
   * Used right after ingest so tasks are created strictly according to the
   * forecast that just arrived — no unrelated rows are touched.
   */
  async generateForRows(rows: ProductionPlanPriority[]): Promise<GenerationSummary> {
    const summary: GenerationSummary = {
      created: 0,
      updated: 0,
      cancelled: 0,
      skipped: 0,
      unchanged: 0,
      total: 0
    };

    for (const row of rows) {
      await generateForRow(row, summary);
    }

    return summary;
  }
};
