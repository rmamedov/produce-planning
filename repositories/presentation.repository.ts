import { Prisma, TaskStatus } from "@prisma/client";
import type { Presentation as PresentationRow } from "@prisma/client";

import { HttpError } from "@/api/http";
import { getFilialName, getFilialShortName } from "@/domain/filials";
import type { FilialSummary, Presentation } from "@/features/production-tasks/types";
import { prisma } from "@/lib/prisma";

export const DUPLICATE_PRESENTATION_NAME = "Представлення з такою назвою вже є";
export const PRESENTATION_NOT_FOUND = "Presentation not found";

export interface PresentationInput {
  name: string;
  filial_ids: number[];
  window_hours: number;
}

export type PresentationData = Pick<PresentationRow, "name" | "filialIds" | "windowMinutes">;

const byNumber = (a: number, b: number) => a - b;

export function toPresentationData(input: PresentationInput): PresentationData {
  return {
    name: input.name.trim(),
    filialIds: Array.from(new Set(input.filial_ids)).sort(byNumber),
    windowMinutes: Math.round(input.window_hours * 60)
  };
}

export function toPresentationDto(
  row: Pick<PresentationRow, "id" | "name" | "filialIds" | "windowMinutes">
): Presentation {
  return {
    id: row.id,
    name: row.name,
    filial_ids: [...row.filialIds].sort(byNumber),
    window_minutes: row.windowMinutes,
    window_hours: row.windowMinutes / 60
  };
}

export function comparePresentationNames(a: { name: string }, b: { name: string }): number {
  return a.name.localeCompare(b.name, "uk");
}

export function buildFilialSummaries(
  filialIds: Iterable<number>,
  activeTasks: ReadonlyMap<number, number>
): FilialSummary[] {
  return Array.from(new Set(filialIds))
    .sort(byNumber)
    .map((filialId) => ({
      filial_id: filialId,
      name: getFilialName(filialId),
      short_name: getFilialShortName(filialId),
      active_tasks: activeTasks.get(filialId) ?? 0
    }));
}

function isKnownRequestError(error: unknown, code: string) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

// `name` is unique in the DB, but only case-sensitively.
async function assertNameAvailable(name: string, exceptId?: string) {
  const clash = await prisma.presentation.findFirst({
    where: {
      name: { equals: name, mode: "insensitive" },
      ...(exceptId ? { NOT: { id: exceptId } } : {})
    },
    select: { id: true }
  });
  if (clash) {
    throw new HttpError(400, DUPLICATE_PRESENTATION_NAME);
  }
}

function rethrowWriteError(error: unknown): never {
  if (isKnownRequestError(error, "P2002")) {
    throw new HttpError(400, DUPLICATE_PRESENTATION_NAME);
  }
  if (isKnownRequestError(error, "P2025")) {
    throw new HttpError(404, PRESENTATION_NOT_FOUND);
  }
  throw error;
}

export const presentationRepository = {
  async list(): Promise<Presentation[]> {
    const rows = await prisma.presentation.findMany();
    return rows.map(toPresentationDto).sort(comparePresentationNames);
  },

  async create(data: PresentationData): Promise<Presentation> {
    await assertNameAvailable(data.name);
    const row = await prisma.presentation.create({ data }).catch(rethrowWriteError);
    return toPresentationDto(row);
  },

  async update(id: string, data: PresentationData): Promise<Presentation> {
    const existing = await prisma.presentation.findUnique({ where: { id }, select: { id: true } });
    if (!existing) {
      throw new HttpError(404, PRESENTATION_NOT_FOUND);
    }
    await assertNameAvailable(data.name, id);
    const row = await prisma.presentation.update({ where: { id }, data }).catch(rethrowWriteError);
    return toPresentationDto(row);
  },

  async delete(id: string) {
    await prisma.presentation.deleteMany({ where: { id } });
  },

  /** Every filial known from forecasts or tasks, with its count of NEW/IN_PROGRESS tasks. */
  async listFilials(): Promise<FilialSummary[]> {
    const [planFilials, taskFilials, active] = await Promise.all([
      prisma.productionPlanPriority.findMany({ distinct: ["filialId"], select: { filialId: true } }),
      prisma.productionTask.findMany({ distinct: ["filialId"], select: { filialId: true } }),
      prisma.productionTask.groupBy({
        by: ["filialId"],
        where: { status: { in: [TaskStatus.NEW, TaskStatus.IN_PROGRESS] } },
        _count: { _all: true }
      })
    ]);

    return buildFilialSummaries(
      [...planFilials, ...taskFilials].map((row) => row.filialId),
      new Map(active.map((row) => [row.filialId, row._count._all] as const))
    );
  }
};
