import { NextRequest } from "next/server";
import { Prisma, TaskStatus } from "@prisma/client";
import * as XLSX from "xlsx";

import { handleApiError } from "@/api/http";
import { getDepartmentName } from "@/domain/departments";
import { getFilialName } from "@/domain/filials";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<TaskStatus, string> = {
  NEW: "До виконання",
  IN_PROGRESS: "В роботі",
  DONE: "Виконано",
  CANCELLED: "Скасовано"
};

const PRIORITY_LABELS: Record<string, string> = {
  CRITICAL: "Критичний",
  HIGH: "Високий",
  MEDIUM: "Нормальний",
  LOW: "Нормальний"
};

const KYIV_OFFSET = "+03:00";

function fmt(date: Date | null): string {
  return date ? date.toISOString() : "";
}

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;

    const filialIds = (params.get("filial_id") ?? "")
      .split(",")
      .map((v) => Number(v.trim()))
      .filter((n) => Number.isFinite(n) && n > 0);

    const statuses = (params.get("status") ?? "")
      .split(",")
      .map((v) => v.trim())
      .filter((v): v is TaskStatus => v in STATUS_LABELS);

    const from = params.get("from");
    const to = params.get("to");

    const where: Prisma.ProductionTaskWhereInput = {};
    if (filialIds.length) where.filialId = { in: filialIds };
    if (statuses.length) where.status = { in: statuses };
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(`${from}T00:00:00.000${KYIV_OFFSET}`);
      if (to) where.createdAt.lte = new Date(`${to}T23:59:59.999${KYIV_OFFSET}`);
    }

    const tasks = await prisma.productionTask.findMany({
      where,
      orderBy: [{ createdAt: "desc" }]
    });

    const rows = tasks.map((t) => ({
      ID: t.id,
      "Філія ID": t.filialId,
      Філія: getFilialName(t.filialId),
      "Відділ ID": t.departmentId ?? "",
      Відділ: getDepartmentName(t.departmentId) ?? "",
      "Lager ID": t.lagerId,
      Товар: t.lagerName ?? "",
      Одиниця: t.lagerUnit ?? "",
      "Дата прогнозу": t.historyDate.toISOString().split("T")[0],
      "Год. знімку": t.snapshotHour ?? "",
      Пріоритет: PRIORITY_LABELS[t.priority] ?? t.priority,
      "Рівень пріоритету": t.priorityLevel,
      Статус: STATUS_LABELS[t.status],
      "До виробництва": t.quantity,
      "Покриття (год)": t.coveredHours,
      Залишок: t.currentStockQty ?? "",
      Опис: t.reason,
      "Причина скасування": t.cancelReason ?? "",
      "Час готовності": fmt(t.operationalReadyAt),
      Створено: fmt(t.createdAt),
      Оновлено: fmt(t.updatedAt),
      Розпочато: fmt(t.startedAt),
      Завершено: fmt(t.completedAt)
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Виробничі задачі");
    const buffer: Buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    const body = new Uint8Array(buffer);

    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    return new Response(body, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="production-tasks-${stamp}.xlsx"`,
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    return handleApiError(error);
  }
}
