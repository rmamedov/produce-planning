// Pure logic of the «Виконані» tab and the transfer document. Unit-tested in
// tests/task-documenting.test.ts.

import { ApiError } from "@/lib/api-error";
import { plural } from "@/lib/presentation-grouping";

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

const TRANSFER_FORMS: [string, string, string] = ["трансфер", "трансфери", "трансферів"];

/** Success toast of «Оформити документ»; null when nothing was documented. */
export function transferToastMessage(transferIds: string[], delivered: boolean): string | null {
  if (!transferIds.length) return null;
  const text =
    transferIds.length === 1
      ? `Трансфер сформовано в Рубіконі · №${transferIds[0].slice(0, 8)}`
      : `Сформовано ${transferIds.length} ${plural(transferIds.length, TRANSFER_FORMS)} у Рубіконі`;
  return delivered ? text : `${text} (тестовий режим, без відправки)`;
}

export interface DocumentFailureInfo {
  message: string;
  /** TransferDocumentErrorCode, or null for a failure without one (offline, 500). */
  code: string | null;
  /** Transfers created before the failure: their tasks did leave the tab. */
  transferIds: string[];
  delivered: boolean;
}

/** Reads a failed «Оформити документ» call, keeping what did go through. */
export function documentFailureInfo(error: unknown): DocumentFailureInfo {
  const body = error instanceof ApiError ? error.body : {};
  const transferIds = Array.isArray(body.transfer_ids)
    ? body.transfer_ids.filter((id): id is string => typeof id === "string")
    : [];
  return {
    message: error instanceof Error ? error.message : "Не вдалося сформувати документ",
    code: typeof body.code === "string" ? body.code : null,
    transferIds,
    delivered: body.delivered === true
  };
}

/** Рубікон-wide failures: the next filial of «Оформити всі» would only fail the same way. */
export function stopsDocumentRun(code: string | null): boolean {
  return code === "unreachable" || code === "auth" || code === "config";
}
