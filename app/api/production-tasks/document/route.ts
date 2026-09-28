import { TaskStatus } from "@prisma/client";

import { handleApiError, ok, parseJsonBody } from "@/api/http";
import { productionTaskDocumentSchema } from "@/api/schemas";
import { prisma } from "@/lib/prisma";
import { productionTaskEvents } from "@/services/production-tasks/production-task-events";
import { rubiconTransferService } from "@/services/rubicon/rubicon-transfer.service";

export async function POST(request: Request) {
  try {
    const { task_ids } = productionTaskDocumentSchema.parse(await parseJsonBody(request));

    // Only completed, not-yet-documented tasks may enter a transfer; anything
    // else in the list (raced away, already documented) is skipped, not failed.
    const tasks = await prisma.productionTask.findMany({
      where: { id: { in: task_ids }, status: TaskStatus.DONE, documentedAt: null }
    });

    if (tasks.length === 0) {
      return ok({ transfer_id: null, documented: 0, skipped: task_ids.length });
    }

    // One document per filial — the tab is always scoped to one, but guard it.
    const filialIds = Array.from(new Set(tasks.map((task) => task.filialId)));
    if (filialIds.length > 1) {
      throw new Error("Всі задачі документа мають належати одній філії");
    }

    const transfer = await rubiconTransferService.createTransfer(filialIds[0], tasks);

    await prisma.productionTask.updateMany({
      where: { id: { in: tasks.map((task) => task.id) } },
      data: { documentedAt: new Date(), transferId: transfer.transferId }
    });

    // Boards refresh instantly: documented tasks leave the «Виконані» tab.
    productionTaskEvents.publish("documented");

    return ok({
      transfer_id: transfer.transferId,
      documented: tasks.length,
      skipped: task_ids.length - tasks.length,
      delivered: transfer.delivered
    });
  } catch (error) {
    return handleApiError(error);
  }
}
