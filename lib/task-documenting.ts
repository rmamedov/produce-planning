// Pure logic of the «Виконані» tab and the transfer document. Unit-tested in
// tests/task-documenting.test.ts.

export interface DocumentableTask {
  status: string;
  documented_at?: string | null;
}

/** The tab lists (and the document accepts) DONE tasks not yet documented. */
export function isDocumentable(task: DocumentableTask): boolean {
  return task.status === "DONE" && !task.documented_at;
}

export interface SummableTask {
  unit?: string | null;
  produced_qty?: number | null;
  quantity: number;
}

/** What goes into the transfer: the reported produced qty, else the order. */
export function documentQuantity(task: SummableTask): number {
  return task.produced_qty ?? task.quantity;
}

export interface DocumentTotals {
  count: number;
  pcs: number;
  kg: number;
}

/** Footer totals: pieces and kilograms are never mixed into one number. */
export function documentTotals(tasks: SummableTask[]): DocumentTotals {
  const totals: DocumentTotals = { count: tasks.length, pcs: 0, kg: 0 };
  for (const task of tasks) {
    if (task.unit === "кг") totals.kg += documentQuantity(task);
    else totals.pcs += documentQuantity(task);
  }
  totals.kg = Math.round(totals.kg * 100) / 100;
  totals.pcs = Math.round(totals.pcs * 100) / 100;
  return totals;
}

/**
 * Default selection: everything is checked. New tasks appearing later must
 * come in checked too, so the UI stores the DESELECTED ids and derives the
 * selection — this function keeps that stored set free of stale ids.
 */
export function pruneDeselected(deselected: Set<string>, presentIds: string[]): Set<string> {
  const present = new Set(presentIds);
  return new Set([...deselected].filter((id) => present.has(id)));
}

/** Transfer id, readable in logs and on the task: RBK-YYYYMMDD-XXXXXX. */
export function generateTransferId(now: Date, random: () => number = Math.random): string {
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = Math.floor(random() * 36 ** 6)
    .toString(36)
    .toUpperCase()
    .padStart(6, "0");
  return `RBK-${date}-${suffix}`;
}
