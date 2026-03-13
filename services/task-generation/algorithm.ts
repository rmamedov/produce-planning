import { addHours, startOfHour } from "date-fns";

import type { GeneratedTaskDecision, PlanningProductSnapshot } from "@/domain/task-generation";
import { TaskPriority, TimelinessStatus } from "@/domain/enums";

function buildForecastWindow(snapshot: PlanningProductSnapshot, now: Date, horizonHours: number) {
  const windowStart = startOfHour(now);
  const buckets = Array.from({ length: horizonHours }, (_, index) => {
    const hour = addHours(windowStart, index);
    const slot = snapshot.forecasts.find((item) => item.hour.getTime() === hour.getTime());
    return {
      hour,
      forecastedSalesQty: slot?.forecastedSalesQty ?? 0
    };
  });

  return buckets;
}

export function evaluateTaskGeneration(
  snapshot: PlanningProductSnapshot,
  now: Date,
  horizonHours: number
): GeneratedTaskDecision {
  const buckets = buildForecastWindow(snapshot, now, horizonHours);
  const availableStock = snapshot.currentStock + snapshot.activeTaskQuantity;
  const forecastDemand = buckets.reduce((sum, item) => sum + item.forecastedSalesQty, 0);
  const requiredStock = forecastDemand + snapshot.hourlyTargetStock;
  const deficit = requiredStock - availableStock;
  const allocatedTimeMinutes = snapshot.cookingTimeMinutes;

  let runningStock = availableStock;
  let shortageHour: Date | null = null;

  for (const bucket of buckets) {
    runningStock -= bucket.forecastedSalesQty;
    if (runningStock < snapshot.hourlyTargetStock) {
      shortageHour = bucket.hour;
      break;
    }
  }

  if (!shortageHour && deficit > 0) {
    shortageHour = buckets.at(-1)?.hour ?? now;
  }

  let coverageHours = 0;
  let currentCoverageStock = snapshot.currentStock;
  for (const bucket of buckets) {
    if (currentCoverageStock - bucket.forecastedSalesQty < 0) {
      break;
    }

    currentCoverageStock -= bucket.forecastedSalesQty;
    coverageHours += 1;
  }

  const expectedReadyAt = shortageHour;
  const shouldStartImmediately =
    snapshot.currentStock === 0 ||
    (expectedReadyAt ? expectedReadyAt.getTime() - now.getTime() <= allocatedTimeMinutes * 60_000 : false);

  const taskQuantity = Math.max(0, Math.ceil(deficit));

  let priority: TaskPriority = TaskPriority.LOW;
  let priorityReason = "Запас покриває щонайменше 2 години прогнозу.";

  if (snapshot.currentStock === 0) {
    priority = TaskPriority.CRITICAL;
    priorityReason = "Поточний залишок дорівнює нулю.";
  } else if (shouldStartImmediately) {
    priority = TaskPriority.CRITICAL;
    priorityReason = "Потрібно почати негайно, щоб не допустити дефіцит до потрібної години.";
  } else if (coverageHours < 1) {
    priority = TaskPriority.HIGH;
    priorityReason = "Поточний запас покриває менше ніж 1 годину прогнозного попиту.";
  } else if (coverageHours < 2) {
    priority = TaskPriority.MEDIUM;
    priorityReason = "Поточний запас покриває від 1 до 2 годин прогнозного попиту.";
  }

  return {
    availableStock,
    forecastDemand,
    requiredStock,
    deficit,
    taskQuantity,
    shortageHour,
    expectedReadyAt,
    allocatedTimeMinutes,
    coverageHours,
    priority,
    priorityReason,
    timelinessStatus:
      expectedReadyAt && expectedReadyAt.getTime() <= now.getTime()
        ? TimelinessStatus.OVERDUE
        : TimelinessStatus.ON_TIME,
    shouldCreateTask: deficit > 0,
    reason: deficit > 0 ? undefined : "Дефіцит відсутній, нове завдання не потрібне."
  };
}
