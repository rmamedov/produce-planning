import { NextRequest } from "next/server";
import { TaskStatus } from "@prisma/client";

import { handleApiError, ok } from "@/api/http";
import { getDepartmentName } from "@/domain/departments";
import { getFilialName } from "@/domain/filials";
import { prisma } from "@/lib/prisma";

interface TaskRow {
  filialId: number;
  departmentId: number | null;
  status: TaskStatus;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  operationalReadyAt: Date | null;
}

interface Metrics {
  total: number;
  active: number; // NEW + IN_PROGRESS ("на зараз")
  done: number;
  cancelled: number;
  completed_pct: number; // done / total
  on_time_now_pct: number; // active not-overdue / active
  avg_completion_minutes: number; // avg(completedAt - startedAt) for done
}

const KYIV_OFFSET_MS = 3 * 60 * 60 * 1000; // display hours in Kyiv time (UTC+3)

function kyivHour(date: Date): number {
  return new Date(date.getTime() + KYIV_OFFSET_MS).getUTCHours();
}

function computeMetrics(rows: TaskRow[], now: number): Metrics {
  const total = rows.length;
  const done = rows.filter((r) => r.status === TaskStatus.DONE);
  const cancelled = rows.filter((r) => r.status === TaskStatus.CANCELLED);
  const active = rows.filter(
    (r) => r.status === TaskStatus.NEW || r.status === TaskStatus.IN_PROGRESS
  );

  const onTimeActive = active.filter(
    (r) => !r.operationalReadyAt || r.operationalReadyAt.getTime() >= now
  ).length;

  const durations = done
    .filter((r) => r.completedAt && r.startedAt)
    .map((r) => (r.completedAt!.getTime() - r.startedAt!.getTime()) / 60000)
    .filter((m) => m >= 0);

  return {
    total,
    active: active.length,
    done: done.length,
    cancelled: cancelled.length,
    completed_pct: total ? Math.round((done.length / total) * 100) : 0,
    on_time_now_pct: active.length ? Math.round((onTimeActive / active.length) * 100) : 100,
    avg_completion_minutes: durations.length
      ? Math.round(durations.reduce((s, m) => s + m, 0) / durations.length)
      : 0
  };
}

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const filialId = params.get("filial_id") ? Number(params.get("filial_id")) : undefined;
    const departmentId = params.get("department_id") ? Number(params.get("department_id")) : undefined;

    const where: Record<string, unknown> = {};
    if (filialId) where.filialId = filialId;
    if (departmentId) where.departmentId = departmentId;

    const rows = (await prisma.productionTask.findMany({
      where,
      select: {
        filialId: true,
        departmentId: true,
        status: true,
        createdAt: true,
        startedAt: true,
        completedAt: true,
        operationalReadyAt: true
      }
    })) as TaskRow[];

    const now = Date.now();

    // Per-filial breakdown.
    const filialIds = Array.from(new Set(rows.map((r) => r.filialId))).sort((a, b) => a - b);
    const by_filial = filialIds.map((id) => ({
      filial_id: id,
      filial_name: getFilialName(id),
      ...computeMetrics(rows.filter((r) => r.filialId === id), now)
    }));

    // Per-department breakdown.
    const departmentIds = Array.from(
      new Set(rows.map((r) => r.departmentId).filter((id): id is number => id != null))
    ).sort((a, b) => a - b);
    const by_department = departmentIds.map((id) => ({
      department_id: id,
      department_name: getDepartmentName(id) ?? `Відділ ${id}`,
      ...computeMetrics(rows.filter((r) => r.departmentId === id), now)
    }));

    // Hourly breakdown (Kyiv hour 0-23):
    //  - task_count: tasks created in that hour
    //  - on_time_pct: of tasks completed in that hour, share finished before the deadline
    const hourly = Array.from({ length: 24 }, (_, hour) => {
      const created = rows.filter((r) => kyivHour(r.createdAt) === hour);
      const completedInHour = rows.filter(
        (r) => r.status === TaskStatus.DONE && r.completedAt && kyivHour(r.completedAt) === hour
      );
      const onTimeCompleted = completedInHour.filter(
        (r) => r.operationalReadyAt && r.completedAt && r.completedAt.getTime() <= r.operationalReadyAt.getTime()
      ).length;

      return {
        hour,
        task_count: created.length,
        completed_count: completedInHour.length,
        on_time_pct: completedInHour.length
          ? Math.round((onTimeCompleted / completedInHour.length) * 100)
          : null
      };
    });

    return ok({
      generated_at: new Date().toISOString(),
      overall: computeMetrics(rows, now),
      by_filial,
      by_department,
      hourly
    });
  } catch (error) {
    return handleApiError(error);
  }
}
