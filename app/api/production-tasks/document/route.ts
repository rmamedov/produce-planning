import { TaskStatus } from "@prisma/client";

import { HttpError, assertSameOrigin, handleApiError, ok, parseJsonBody } from "@/api/http";
import { productionTaskDocumentSchema } from "@/api/schemas";
import type { TransferDocumentErrorBody, TransferDocumentResponse } from "@/features/production-tasks/types";
import { prisma } from "@/lib/prisma";
import { presentationRepository } from "@/repositories/presentation.repository";
import { productionTaskEvents } from "@/services/production-tasks/production-task-events";
import { buildTransferGroups, resumedOrderIds, type TransferGroup } from "@/services/rubicon/rubicon-payload";
import { documentTransferGroups, rubiconTransferService } from "@/services/rubicon/rubicon-transfer.service";

const UNDOCUMENTED = { status: TaskStatus.DONE, documentedAt: null };

async function release(group: TransferGroup) {
  await prisma.productionTask.updateMany({
    where: { id: { in: group.taskIds }, transferId: group.payload.orderId, documentedAt: null },
    data: { transferId: null }
  });
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { task_ids, presentation_id } = productionTaskDocumentSchema.parse(await parseJsonBody(request));

    // Only completed, not-yet-documented tasks may enter a transfer; anything
    // else in the list (raced away, already documented) is skipped, not failed.
    const selected = await prisma.productionTask.findMany({ where: { id: { in: task_ids }, ...UNDOCUMENTED } });

    if (selected.length === 0) {
      return ok<TransferDocumentResponse>({
        transfer_id: null,
        transfer_ids: [],
        documented: 0,
        skipped: task_ids.length,
        delivered: false
      });
    }

    // An earlier unanswered attempt is resent whole, even if the selection
    // dropped some of its tasks since (see buildTransferGroups).
    const resumed = resumedOrderIds(selected);
    const siblings = resumed.length
      ? await prisma.productionTask.findMany({
          where: { transferId: { in: resumed }, id: { notIn: selected.map((task) => task.id) }, ...UNDOCUMENTED }
        })
      : [];
    const tasks = [...selected, ...siblings];

    // One document per filial — the tab is always scoped to one, but guard it.
    const filialIds = Array.from(new Set(tasks.map((task) => task.filialId)));
    if (filialIds.length > 1) {
      throw new Error("Всі задачі документа мають належати одній філії");
    }

    const presentation = presentation_id ? await presentationRepository.findById(presentation_id) : null;
    const now = new Date();
    const outcome = await documentTransferGroups(buildTransferGroups(tasks, { presentation, now }), {
      claim: async (group) => {
        const { count } = await prisma.productionTask.updateMany({
          where: { id: { in: group.taskIds }, transferId: null, ...UNDOCUMENTED },
          data: { transferId: group.payload.orderId }
        });
        if (count === group.taskIds.length) return true;
        // Another tablet took some of them first: give back what this one took.
        if (count > 0) await release(group);
        return false;
      },
      send: (payload) => rubiconTransferService.sendTransfer(payload),
      markDocumented: async (group) => {
        const { count } = await prisma.productionTask.updateMany({
          where: { id: { in: group.taskIds }, ...UNDOCUMENTED },
          data: { documentedAt: now, transferId: group.payload.orderId }
        });
        return count;
      },
      release
    });

    // Boards refresh instantly: documented tasks leave the «Виконані» tab.
    if (outcome.documented > 0) {
      productionTaskEvents.publish("documented");
    }
    if (outcome.error) {
      const { code, message } = outcome.error;
      const details: Omit<TransferDocumentErrorBody, "message"> = {
        code,
        transfer_ids: outcome.transferIds,
        documented: outcome.documented,
        delivered: outcome.delivered
      };
      throw new HttpError(code === "conflict" ? 409 : 502, message, { ...details });
    }

    const documentedIds = new Set(outcome.documentedTaskIds);
    return ok<TransferDocumentResponse>({
      transfer_id: outcome.transferIds[0] ?? null,
      transfer_ids: outcome.transferIds,
      documented: outcome.documented,
      skipped: task_ids.filter((id) => !documentedIds.has(id)).length,
      delivered: outcome.delivered
    });
  } catch (error) {
    return handleApiError(error);
  }
}
