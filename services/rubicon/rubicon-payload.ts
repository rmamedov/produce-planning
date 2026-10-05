// Pure mapping of «Виконані» tasks to Рубікон production transfers
// (POST /v1/ecom/dams/production-transfers). Unit-tested in
// tests/rubicon-transfer.test.ts.

import { createHash } from "node:crypto";

import type { ProductionTask } from "@prisma/client";

import type { Presentation } from "@/features/production-tasks/types";

// Fixed forever: changing it would give an already-sent selection a new
// orderId, and Рубікон would create a duplicate transfer on retry.
const TRANSFER_ORDER_NAMESPACE = "ecc6932d-7cf4-446f-9204-73b1962eb65d";

export const TRANSFER_ORDER_NUMBER = "0";

export type TransferTask = Pick<
  ProductionTask,
  "id" | "filialId" | "lagerId" | "historyDate" | "quantity" | "producedQty" | "transferId"
>;

export type ProducerPresentation = Pick<Presentation, "filial_ids" | "production_filial_id">;

export interface TransferPayloadItem {
  sku: number;
  quantity: number;
}

export interface TransferPayload {
  sourceFilial: number;
  destinationFilial: number;
  productionForecastId: string;
  orderId: string;
  orderNumber: string;
  date: string;
  items: TransferPayloadItem[];
}

export interface TransferGroup {
  taskIds: string[];
  /** The orderId was taken by an earlier attempt whose Рубікон outcome is unknown. */
  resumed: boolean;
  payload: TransferPayload;
}

/** RFC 4122 name-based UUID (SHA-1, version 5). */
export function uuidV5(name: string, namespace: string): string {
  const hash = createHash("sha1")
    .update(Buffer.from(namespace.replace(/-/g, ""), "hex"))
    .update(name, "utf8")
    .digest();
  const bytes = hash.subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Рубікон's idempotency key: the same set of tasks always maps to the same orderId. */
export function transferOrderId(taskIds: string[]): string {
  return uuidV5(Array.from(new Set(taskIds)).sort().join(","), TRANSFER_ORDER_NAMESPACE);
}

/** Forecasts are ingested per filial and history date. */
export function productionForecastId(filialId: number, historyDate: string): string {
  return `forecast-${filialId}-${historyDate}`;
}

/** ISO 8601 UTC without milliseconds: 2026-10-01T09:30:00Z. */
export function formatTransferDate(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** The kitchen that produced the goods: the presentation's producer, else the ordering filial itself. */
export function resolveSourceFilial(destinationFilial: number, presentation: ProducerPresentation | null): number {
  const producer = presentation?.production_filial_id ?? null;
  return producer !== null && presentation?.filial_ids.includes(destinationFilial) ? producer : destinationFilial;
}

/** One line per SKU: produced qty (else ordered), summed, 3 decimals, non-positive lines dropped. */
export function buildTransferItems(tasks: TransferTask[]): TransferPayloadItem[] {
  const bySku = new Map<number, number>();
  for (const task of tasks) {
    bySku.set(task.lagerId, (bySku.get(task.lagerId) ?? 0) + (task.producedQty ?? task.quantity));
  }
  return Array.from(bySku, ([sku, total]) => ({ sku, quantity: Math.round(total * 1000) / 1000 }))
    .filter((item) => item.quantity > 0)
    .sort((a, b) => a.sku - b.sku);
}

/**
 * One transfer per (ordering filial, production date). Groups whose items all
 * net to zero are not sent — their tasks stay undocumented.
 *
 * Tasks still holding a `transferId` were sent before without a definite
 * answer: they go out again as their own group under that exact orderId and
 * are never folded into a fresh selection, or a retry would mint a new
 * orderId and Рубікон would ship them twice. Pass ALL tasks holding it.
 */
export function buildTransferGroups(
  tasks: TransferTask[],
  { presentation, now }: { presentation: ProducerPresentation | null; now: Date }
): TransferGroup[] {
  const groups = new Map<
    string,
    { filialId: number; historyDate: string; resumedOrderId: string | null; tasks: TransferTask[] }
  >();
  for (const task of tasks) {
    const historyDate = task.historyDate.toISOString().slice(0, 10);
    const key = task.transferId ? `resumed|${task.transferId}` : `${task.filialId}|${historyDate}`;
    const group = groups.get(key);
    if (group) group.tasks.push(task);
    else groups.set(key, { filialId: task.filialId, historyDate, resumedOrderId: task.transferId, tasks: [task] });
  }

  return Array.from(groups.values())
    .sort(
      (a, b) =>
        a.filialId - b.filialId ||
        a.historyDate.localeCompare(b.historyDate) ||
        Number(b.resumedOrderId !== null) - Number(a.resumedOrderId !== null) ||
        (a.resumedOrderId ?? "").localeCompare(b.resumedOrderId ?? "")
    )
    .map((group) => {
      const taskIds = group.tasks.map((task) => task.id);
      return {
        taskIds,
        resumed: group.resumedOrderId !== null,
        payload: {
          sourceFilial: resolveSourceFilial(group.filialId, presentation),
          destinationFilial: group.filialId,
          productionForecastId: productionForecastId(group.filialId, group.historyDate),
          orderId: group.resumedOrderId ?? transferOrderId(taskIds),
          orderNumber: TRANSFER_ORDER_NUMBER,
          date: formatTransferDate(now),
          items: buildTransferItems(group.tasks)
        }
      };
    })
    .filter((group) => group.payload.items.length > 0);
}

/** Order ids held by undocumented tasks from an earlier, unanswered attempt. */
export function resumedOrderIds(tasks: Pick<TransferTask, "transferId">[]): string[] {
  return Array.from(new Set(tasks.flatMap((task) => (task.transferId ? [task.transferId] : []))));
}
