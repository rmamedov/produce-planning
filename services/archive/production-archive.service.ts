import path from "node:path";

import { prisma } from "@/lib/prisma";
import {
  archiveCutoff,
  groupRowsByDate,
  listArchiveFiles,
  mergeArchivePayloads,
  readArchiveFile,
  writeArchiveFile,
  type ArchiveFileInfo,
  type ArchivePayload
} from "@/lib/archive";

// Archive files live next to the app (survives deploys; excluded from rsync/git).
const ARCHIVE_DIR = process.env.ARCHIVE_DIR ?? path.join(process.cwd(), "archive");

export interface ArchiveRunSummary {
  cutoff: string;
  archived_dates: string[];
  tasks: number;
  plan_rows: number;
}

function toPlain(rows: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  // JSON round-trip: Prisma Date fields become ISO strings for disk storage.
  return JSON.parse(JSON.stringify(rows)) as Array<Record<string, unknown>>;
}

export const productionArchiveService = {
  /**
   * Moves tasks and forecast rows with history_date older than `days` days
   * from the database to gzipped JSON files on disk (one file per date),
   * then deletes them from the database. Idempotent: re-runs merge into the
   * existing files by row id.
   */
  async run(days = 7): Promise<ArchiveRunSummary> {
    const cutoffStr = archiveCutoff(new Date(), days);
    const cutoff = new Date(`${cutoffStr}T00:00:00.000Z`);

    const [tasks, planRows] = await Promise.all([
      prisma.productionTask.findMany({ where: { historyDate: { lt: cutoff } } }),
      prisma.productionPlanPriority.findMany({ where: { historyDate: { lt: cutoff } } })
    ]);

    if (tasks.length === 0 && planRows.length === 0) {
      return { cutoff: cutoffStr, archived_dates: [], tasks: 0, plan_rows: 0 };
    }

    const taskGroups = groupRowsByDate(tasks);
    const planGroups = groupRowsByDate(planRows);
    const dates = Array.from(new Set([...taskGroups.keys(), ...planGroups.keys()])).sort();

    const archivedAt = new Date().toISOString();
    for (const date of dates) {
      const incoming: ArchivePayload = {
        history_date: date,
        archived_at: archivedAt,
        tasks: toPlain(taskGroups.get(date) ?? []),
        plan_rows: toPlain(planGroups.get(date) ?? [])
      };
      const existing = await readArchiveFile(ARCHIVE_DIR, date);
      await writeArchiveFile(ARCHIVE_DIR, mergeArchivePayloads(existing, incoming));
    }

    // Delete only after every file is written. Tasks first (they reference
    // plan rows); deleting plan rows would cascade anyway, but this keeps the
    // counts explicit.
    await prisma.$transaction([
      prisma.productionTask.deleteMany({ where: { historyDate: { lt: cutoff } } }),
      prisma.productionPlanPriority.deleteMany({ where: { historyDate: { lt: cutoff } } })
    ]);

    return {
      cutoff: cutoffStr,
      archived_dates: dates,
      tasks: tasks.length,
      plan_rows: planRows.length
    };
  },

  list(): Promise<ArchiveFileInfo[]> {
    return listArchiveFiles(ARCHIVE_DIR);
  },

  read(date: string): Promise<ArchivePayload | null> {
    return readArchiveFile(ARCHIVE_DIR, date);
  }
};
