// Pure grouping logic of the «Представлення» kitchen view: turns the active
// tasks of several filials into batches (партії) of one article, lanes per
// article, and splits a produced total back across the filials. Framework-free
// and clock-free (callers pass `now`); unit-tested in
// tests/presentation-grouping.test.ts.

import { promoMechanicsList } from "@/lib/task-badges";
import { priorityRank } from "@/lib/task-sorting";

export type Unit = "шт" | "кг";
export type NormPriority = "CRITICAL" | "HIGH" | "MEDIUM";

export interface GroupableTask {
  id: string;
  filial_id: number;
  lager_id: number;
  lager_name: string | null;
  unit: string | null;
  status: string;
  priority: string;
  quantity: number;
  operational_ready_at: string | null;
  history_date: string;
  batch_id: string | null;
  started_at: string | null;
  promo_mechanics: string | null;
  is_guest_promise: boolean;
  ecom_orders_qty: number | null;
  bakery_type: string | null;
}

export interface TaskGroup<T extends GroupableTask> {
  key: string;
  kind: "window" | "batch" | "no_time";
  lagerId: number;
  lagerName: string;
  unit: Unit;
  status: "NEW" | "IN_PROGRESS";
  /** Urgency order (see compareMembers). */
  members: T[];
  /** Epoch ms of the earliest member readiness. */
  deadline: number | null;
  /** Epoch ms of the latest member readiness. */
  last: number | null;
  priority: NormPriority;
  /** шт — integer, кг — rounded to 0.1. */
  total: number;
  /** Distinct, ascending. */
  filialIds: number[];
  /** Earliest started_at of the members (batches). */
  startedAt: string | null;
  promoMechanics: string[];
  guest: boolean;
  ecomTotal: number;
  bakeryType: string | null;
}

export interface LagerLane<T extends GroupableTask> {
  key: string;
  lagerId: number;
  lagerName: string;
  unit: Unit;
  groups: TaskGroup<T>[];
  bestPriority: NormPriority;
  total: number;
}

const MINUTE_MS = 60_000;

/** Same rule as the board card: only "шт" is pieces, anything else (incl. null) is кг. */
export function effectiveUnit(unit: string | null | undefined): Unit {
  return unit === "шт" ? "шт" : "кг";
}

/** LOW and unknown values display as «Нормальний», so they collapse to MEDIUM. */
export function normPriority(p: string): NormPriority {
  return p === "CRITICAL" || p === "HIGH" ? p : "MEDIUM";
}

/** CRITICAL 0, HIGH 1, MEDIUM/LOW 2, unknown 3. */
export function priorityRankOf(p: string): number {
  return priorityRank(p);
}

/** Readiness as epoch ms floored to the minute; missing/invalid → null. */
export function readyMs(iso: string | null): number | null {
  if (!iso) return null;
  const time = new Date(iso).getTime();
  return Number.isNaN(time) ? null : Math.floor(time / MINUTE_MS) * MINUTE_MS;
}

function compareNullableAsc(a: number | null, b: number | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Row urgency: priority ↑, readiness ↑ (none last), filial ↑, history date ↑, id ↑. */
export function compareMembers(a: GroupableTask, b: GroupableTask): number {
  return (
    priorityRankOf(a.priority) - priorityRankOf(b.priority) ||
    compareNullableAsc(readyMs(a.operational_ready_at), readyMs(b.operational_ready_at)) ||
    a.filial_id - b.filial_id ||
    compareStrings(a.history_date, b.history_date) ||
    compareStrings(a.id, b.id)
  );
}

function roundTotal(value: number, unit: Unit): number {
  return unit === "шт" ? Math.round(value) : Math.round(value * 10) / 10;
}

function buildGroup<T extends GroupableTask>(
  key: string,
  kind: TaskGroup<T>["kind"],
  status: TaskGroup<T>["status"],
  lagerId: number,
  unit: Unit,
  tasks: T[]
): TaskGroup<T> {
  const members = [...tasks].sort(compareMembers);
  const readiness = members
    .map((task) => readyMs(task.operational_ready_at))
    .filter((time): time is number => time !== null);

  let priority: NormPriority = "MEDIUM";
  let startedAt: string | null = null;
  let startedMs = Number.POSITIVE_INFINITY;
  const promo = new Set<string>();
  let guest = false;
  let ecomTotal = 0;
  let quantity = 0;
  for (const task of members) {
    const norm = normPriority(task.priority);
    if (priorityRankOf(norm) < priorityRankOf(priority)) priority = norm;
    const started = task.started_at ? new Date(task.started_at).getTime() : Number.NaN;
    if (!Number.isNaN(started) && started < startedMs) {
      startedMs = started;
      startedAt = task.started_at;
    }
    promoMechanicsList(task.promo_mechanics).forEach((mechanic) => promo.add(mechanic));
    guest ||= task.is_guest_promise;
    ecomTotal += task.ecom_orders_qty ?? 0;
    quantity += task.quantity;
  }

  const lagerName = members.find((task) => task.lager_name?.trim())?.lager_name?.trim();

  return {
    key,
    kind,
    lagerId,
    lagerName: lagerName ?? `Lager ${lagerId}`,
    unit,
    status,
    members,
    deadline: readiness.length ? Math.min(...readiness) : null,
    last: readiness.length ? Math.max(...readiness) : null,
    priority,
    total: roundTotal(quantity, unit),
    filialIds: [...new Set(members.map((task) => task.filial_id))].sort((a, b) => a - b),
    startedAt,
    promoMechanics: [...promo],
    guest,
    ecomTotal,
    bakeryType: members.find((task) => task.bakery_type)?.bakery_type ?? null
  };
}

function pushTo<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

function partitionKey(task: GroupableTask): string {
  return `${task.lager_id}:${effectiveUnit(task.unit)}`;
}

function compareChronological(a: TaskGroup<GroupableTask>, b: TaskGroup<GroupableTask>): number {
  return (
    compareNullableAsc(a.deadline, b.deadline) ||
    a.lagerId - b.lagerId ||
    compareStrings(a.key, b.key)
  );
}

/**
 * Batches of the presentation view, in chronological order (deadline ↑,
 * «Без часу» last). IN_PROGRESS tasks keep the batch they were started in;
 * NEW tasks of one article and unit are packed into anchored windows of
 * `windowMinutes` from the earliest ungrouped readiness (boundary inclusive).
 * DONE/CANCELLED tasks are ignored.
 */
export function groupPresentationTasks<T extends GroupableTask>(
  tasks: T[],
  windowMinutes: number
): TaskGroup<T>[] {
  const windowMs = Number.isFinite(windowMinutes) ? Math.max(0, windowMinutes) * MINUTE_MS : 0;
  const groups: TaskGroup<T>[] = [];

  const batches = new Map<string, T[]>();
  const timed = new Map<string, T[]>();
  const untimed = new Map<string, T[]>();
  for (const task of tasks) {
    if (task.status === "IN_PROGRESS") {
      pushTo(batches, `batch:${task.batch_id ?? `task:${task.id}`}`, task);
    } else if (task.status === "NEW") {
      const target = readyMs(task.operational_ready_at) === null ? untimed : timed;
      pushTo(target, partitionKey(task), task);
    }
  }

  for (const [batchKey, members] of batches) {
    // A batch is started from one group, so it never mixes articles; if the API
    // was fed a mixed list anyway, split it rather than add up different units.
    const parts = new Map<string, T[]>();
    members.forEach((task) => pushTo(parts, partitionKey(task), task));
    for (const [part, partMembers] of parts) {
      const key = parts.size === 1 ? batchKey : `${batchKey}:${part}`;
      const first = partMembers[0];
      groups.push(
        buildGroup(key, "batch", "IN_PROGRESS", first.lager_id, effectiveUnit(first.unit), partMembers)
      );
    }
  }

  for (const members of timed.values()) {
    const first = members[0];
    const unit = effectiveUnit(first.unit);
    const sorted = members
      .map((task) => ({ task, ready: readyMs(task.operational_ready_at) as number }))
      .sort((a, b) => a.ready - b.ready || compareMembers(a.task, b.task));
    let index = 0;
    while (index < sorted.length) {
      const anchor = sorted[index];
      const windowMembers: T[] = [];
      while (index < sorted.length && sorted[index].ready <= anchor.ready + windowMs) {
        windowMembers.push(sorted[index].task);
        index += 1;
      }
      groups.push(
        buildGroup(
          `new:${first.lager_id}:${unit}:${anchor.task.id}`,
          "window",
          "NEW",
          first.lager_id,
          unit,
          windowMembers
        )
      );
    }
  }

  for (const members of untimed.values()) {
    const first = members[0];
    const unit = effectiveUnit(first.unit);
    groups.push(
      buildGroup(`none:${first.lager_id}:${unit}`, "no_time", "NEW", first.lager_id, unit, members)
    );
  }

  return groups.sort(compareChronological);
}

/**
 * Board order. With no priority filter ("all"): Критичні → Високі → Нормальні,
 * then deadline ↑ (none last), article, key. With a concrete priority the rank
 * step would be redundant and is skipped.
 */
export function compareGroups(
  a: TaskGroup<any>,
  b: TaskGroup<any>,
  selectedPriority: string
): number {
  if (selectedPriority === "all") {
    const rankDiff = priorityRankOf(a.priority) - priorityRankOf(b.priority);
    if (rankDiff !== 0) return rankDiff;
  }
  return compareChronological(a, b);
}

/** Display filters, applied to whole batches after grouping. MEDIUM also covers LOW. */
export function groupMatchesFilters(g: TaskGroup<any>, status: string, priority: string): boolean {
  if (status !== "all" && g.status !== status) return false;
  if (priority !== "all" && g.priority !== normPriority(priority)) return false;
  return true;
}

/**
 * The tablet groups by article: one lane per (lager, unit) holding its batches
 * in chronological order. Lanes are ordered by their best batch (compareGroups),
 * so with the "all" priority filter lanes of one bestPriority stay contiguous.
 */
export function buildLagerLanes<T extends GroupableTask>(
  groups: TaskGroup<T>[],
  selectedPriority: string
): LagerLane<T>[] {
  const byLane = new Map<string, TaskGroup<T>[]>();
  groups.forEach((group) => pushTo(byLane, `lane:${group.lagerId}:${group.unit}`, group));

  const lanes: Array<{ best: TaskGroup<T>; lane: LagerLane<T> }> = [];
  for (const [key, laneGroups] of byLane) {
    const sorted = [...laneGroups].sort(compareChronological);
    const best = sorted.reduce((acc, group) =>
      compareGroups(group, acc, selectedPriority) < 0 ? group : acc
    );
    const { lagerId, unit } = best;
    const fallbackName = `Lager ${lagerId}`;
    let bestPriority: NormPriority = "MEDIUM";
    let total = 0;
    for (const group of sorted) {
      if (priorityRankOf(group.priority) < priorityRankOf(bestPriority)) bestPriority = group.priority;
      total += group.total;
    }
    lanes.push({
      best,
      lane: {
        key,
        lagerId,
        lagerName: sorted.find((group) => group.lagerName !== fallbackName)?.lagerName ?? fallbackName,
        unit,
        groups: sorted,
        bestPriority,
        total: roundTotal(total, unit)
      }
    });
  }

  return lanes
    .sort((a, b) => compareGroups(a.best, b.best, selectedPriority))
    .map(({ lane }) => lane);
}

/**
 * Splits a produced total across members given in urgency order. Integer
 * arithmetic in steps of 1 шт / 0.1 кг, so the parts always add up to the
 * total. Shortage fills rows top-down (the least urgent go short); surplus is
 * shared in proportion to the ordered quantities, leftover steps going to the
 * largest remainders (ties → the more urgent row).
 */
export function distributeProduced(total: number, ordered: number[], unit: Unit): number[] {
  if (!ordered.length) return [];
  const scale = unit === "кг" ? 10 : 1;
  const target = Number.isFinite(total) ? Math.max(0, Math.round(total * scale)) : 0;
  const quantities = ordered.map((q) => (Number.isFinite(q) ? Math.max(0, Math.round(q * scale)) : 0));
  const orderedSum = quantities.reduce((sum, q) => sum + q, 0);

  let parts: number[];
  if (orderedSum === 0) {
    const share = Math.floor(target / quantities.length);
    const extra = target - share * quantities.length;
    parts = quantities.map((_, index) => share + (index < extra ? 1 : 0));
  } else if (target <= orderedSum) {
    let remaining = target;
    parts = quantities.map((q) => {
      const part = Math.min(q, remaining);
      remaining -= part;
      return part;
    });
  } else {
    const excess = target - orderedSum;
    parts = quantities.map((q) => q + Math.floor((excess * q) / orderedSum));
    let leftover = target - parts.reduce((sum, part) => sum + part, 0);
    quantities
      .map((q, index) => ({ index, remainder: (excess * q) % orderedSum }))
      .sort((a, b) => b.remainder - a.remainder || a.index - b.index)
      .forEach(({ index }) => {
        if (leftover > 0) {
          parts[index] += 1;
          leftover -= 1;
        }
      });
  }

  return parts.map((part) => part / scale);
}

/** Number of batches the view would show right now (tab counters, scope picker). */
export function countBatches(tasks: GroupableTask[], windowMinutes: number): number {
  return groupPresentationTasks(tasks, windowMinutes).length;
}

interface LoadBucket {
  count: number;
  pcs: number;
  kg: number;
}

/**
 * Load strip: batches whose deadline falls within now + horizon («Стартують
 * до …», boundary inclusive) vs the rest («Пізніше», incl. «Без часу»), and
 * how many are already overdue (deadline < now).
 */
export function loadSummary(
  groups: TaskGroup<any>[],
  now: number,
  horizonMinutes: number
): { soon: LoadBucket; later: LoadBucket; overdue: number } {
  const horizon = now + horizonMinutes * MINUTE_MS;
  const soon: LoadBucket = { count: 0, pcs: 0, kg: 0 };
  const later: LoadBucket = { count: 0, pcs: 0, kg: 0 };
  let overdue = 0;
  for (const group of groups) {
    const bucket = group.deadline !== null && group.deadline <= horizon ? soon : later;
    bucket.count += 1;
    if (group.unit === "шт") bucket.pcs += group.total;
    else bucket.kg += group.total;
    if (group.deadline !== null && group.deadline < now) overdue += 1;
  }
  for (const bucket of [soon, later]) {
    bucket.pcs = roundTotal(bucket.pcs, "шт");
    bucket.kg = roundTotal(bucket.kg, "кг");
  }
  return { soon, later, overdue };
}

/**
 * Ukrainian noun form for n: [1 партія, 2 партії, 5 партій]; 11–14 take the
 * third form. Fractions take the second («1,5 філії»).
 */
export function plural(n: number, forms: [string, string, string]): string {
  if (!Number.isInteger(n)) return forms[1];
  const lastTwo = Math.abs(n) % 100;
  const last = lastTwo % 10;
  if (lastTwo > 10 && lastTwo < 20) return forms[2];
  if (last === 1) return forms[0];
  if (last >= 2 && last <= 4) return forms[1];
  return forms[2];
}
