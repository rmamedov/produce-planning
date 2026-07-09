// Archiving helpers: tasks (and their forecast rows) older than a week are
// written to gzipped JSON files on disk and removed from the database, so the
// hot dataset Postgres/Node keep in memory stays small. Reading an archive
// goes back to disk. Pure/node-only module (no Prisma) — unit-tested in
// tests/archive.test.ts.

import { promises as fs } from "node:fs";
import path from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";

import { isoDateOffset } from "@/lib/kitchen-filters";

export const ARCHIVE_FILE_RE = /^production-archive-(\d{4}-\d{2}-\d{2})\.json\.gz$/;

export interface ArchivePayload {
  history_date: string;
  archived_at: string;
  tasks: Array<Record<string, unknown>>;
  plan_rows: Array<Record<string, unknown>>;
}

export interface ArchiveFileInfo {
  date: string;
  file: string;
  size_bytes: number;
}

/**
 * Rows with history_date strictly BEFORE this YYYY-MM-DD get archived.
 * "Older than a week": now=2026-07-15 → cutoff 2026-07-08, so 2026-07-07
 * is archived and 2026-07-08 is kept.
 */
export function archiveCutoff(now: Date = new Date(), days = 7): string {
  return isoDateOffset(-days, now);
}

/** Date-only key (YYYY-MM-DD) for a Prisma DATE value or ISO string. */
export function historyDateKey(value: Date | string): string {
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

export function archiveFileName(dateStr: string): string {
  return `production-archive-${dateStr}.json.gz`;
}

export function dateFromArchiveFileName(fileName: string): string | null {
  const match = fileName.match(ARCHIVE_FILE_RE);
  return match ? match[1] : null;
}

/** Groups rows by their history date key. */
export function groupRowsByDate<T extends { historyDate: Date | string }>(
  rows: T[]
): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = historyDateKey(row.historyDate);
    const bucket = groups.get(key);
    if (bucket) bucket.push(row);
    else groups.set(key, [row]);
  }
  return groups;
}

/**
 * Merges an existing archive file with newly archived rows for the same date.
 * Rows are deduplicated by id; the incoming version wins (it is newer).
 */
export function mergeArchivePayloads(
  existing: ArchivePayload | null,
  incoming: ArchivePayload
): ArchivePayload {
  if (!existing) return incoming;

  const merge = (
    a: Array<Record<string, unknown>>,
    b: Array<Record<string, unknown>>
  ): Array<Record<string, unknown>> => {
    const byId = new Map(a.map((row) => [String(row.id), row]));
    for (const row of b) byId.set(String(row.id), row);
    return Array.from(byId.values());
  };

  return {
    history_date: incoming.history_date,
    archived_at: incoming.archived_at,
    tasks: merge(existing.tasks, incoming.tasks),
    plan_rows: merge(existing.plan_rows, incoming.plan_rows)
  };
}

export async function writeArchiveFile(dir: string, payload: ArchivePayload): Promise<string> {
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, archiveFileName(payload.history_date));
  await fs.writeFile(file, gzipSync(Buffer.from(JSON.stringify(payload), "utf8")));
  return file;
}

export async function readArchiveFile(dir: string, dateStr: string): Promise<ArchivePayload | null> {
  try {
    const buffer = await fs.readFile(path.join(dir, archiveFileName(dateStr)));
    return JSON.parse(gunzipSync(buffer).toString("utf8")) as ArchivePayload;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function listArchiveFiles(dir: string): Promise<ArchiveFileInfo[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  const files: ArchiveFileInfo[] = [];
  for (const name of entries) {
    const date = dateFromArchiveFileName(name);
    if (!date) continue;
    const stat = await fs.stat(path.join(dir, name));
    files.push({ date, file: name, size_bytes: stat.size });
  }

  // Newest first.
  return files.sort((a, b) => (a.date < b.date ? 1 : -1));
}
