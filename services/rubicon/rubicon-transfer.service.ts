import type { ProductionTask } from "@prisma/client";

import { generateTransferId } from "@/lib/task-documenting";

// TODO(рубікон): справжній API буде надано пізніше — тоді сюди підставляється
// URL + авторизація, а форма payload вже зафіксована нижче.
const RUBICON_API_URL = process.env.RUBICON_API_URL ?? null;

// TODO(аналітика): сюди ж додасться передача даних про виготовлення
// аналітикам, коли буде відомий канал.

export interface TransferItem {
  lager_id: number;
  lager_name: string | null;
  unit: string | null;
  quantity: number; // produced quantity reported by the operator
  ordered_quantity: number;
  completed_at: string | null;
}

export interface TransferResult {
  transferId: string;
  itemCount: number;
  delivered: boolean; // false while the Рубікон API is not wired yet
}

/** The payload the real API will receive — kept stable so wiring the URL later is a no-op for callers. */
export function buildTransferPayload(transferId: string, filialId: number, tasks: ProductionTask[]) {
  return {
    transfer_id: transferId,
    filial_id: filialId,
    created_at: new Date().toISOString(),
    items: tasks.map<TransferItem>((task) => ({
      lager_id: task.lagerId,
      lager_name: task.lagerName,
      unit: task.lagerUnit,
      quantity: task.producedQty ?? task.quantity,
      ordered_quantity: task.quantity,
      completed_at: task.completedAt?.toISOString() ?? null
    }))
  };
}

export const rubiconTransferService = {
  /**
   * Creates a transfer document in Рубікон for the given completed tasks.
   * Async by contract: while the API is not provided, the request is a stub
   * that resolves after building the payload; the caller flow (mark tasks
   * documented, notify boards) is already final.
   */
  async createTransfer(filialId: number, tasks: ProductionTask[]): Promise<TransferResult> {
    const transferId = generateTransferId(new Date());
    const payload = buildTransferPayload(transferId, filialId, tasks);

    let delivered = false;
    if (RUBICON_API_URL) {
      const response = await fetch(RUBICON_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000)
      });
      if (!response.ok) {
        throw new Error(`Рубікон відхилив трансфер: HTTP ${response.status}`);
      }
      delivered = true;
    } else {
      // Стаб: імітуємо асинхронний виклик, логуємо payload для звірки.
      await Promise.resolve();
      console.info("[rubicon:stub] transfer payload", JSON.stringify(payload));
    }

    return { transferId, itemCount: tasks.length, delivered };
  }
};
