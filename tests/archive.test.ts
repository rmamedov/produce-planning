import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  archiveCutoff,
  archiveFileName,
  dateFromArchiveFileName,
  groupRowsByDate,
  historyDateKey,
  listArchiveFiles,
  mergeArchivePayloads,
  readArchiveFile,
  writeArchiveFile,
  type ArchivePayload
} from "@/lib/archive";

const NOW = new Date(2026, 6, 15, 12, 0); // 15 July 2026, local time

describe("archiveCutoff — «старіші за тиждень»", () => {
  it("returns the date 7 days ago by default", () => {
    expect(archiveCutoff(NOW)).toBe("2026-07-08");
  });

  it("archives strictly older dates and keeps the cutoff day itself", () => {
    const cutoff = archiveCutoff(NOW);
    expect("2026-07-07" < cutoff).toBe(true); // archived
    expect("2026-07-08" < cutoff).toBe(false); // kept
    expect("2026-07-09" < cutoff).toBe(false); // kept
  });

  it("supports a custom horizon", () => {
    expect(archiveCutoff(NOW, 1)).toBe("2026-07-14");
    expect(archiveCutoff(NOW, 30)).toBe("2026-06-15");
  });
});

describe("archive file names", () => {
  it("builds and parses names symmetrically", () => {
    const name = archiveFileName("2026-07-01");
    expect(name).toBe("production-archive-2026-07-01.json.gz");
    expect(dateFromArchiveFileName(name)).toBe("2026-07-01");
  });

  it("rejects foreign files", () => {
    expect(dateFromArchiveFileName("notes.txt")).toBeNull();
    expect(dateFromArchiveFileName("production-archive-oops.json.gz")).toBeNull();
  });
});

describe("historyDateKey / groupRowsByDate", () => {
  it("normalizes Date and string values to YYYY-MM-DD", () => {
    expect(historyDateKey(new Date("2026-07-01T00:00:00.000Z"))).toBe("2026-07-01");
    expect(historyDateKey("2026-07-01T00:00:00.000Z")).toBe("2026-07-01");
  });

  it("groups rows by their production date", () => {
    const rows = [
      { id: "a", historyDate: new Date("2026-07-01T00:00:00.000Z") },
      { id: "b", historyDate: new Date("2026-07-01T00:00:00.000Z") },
      { id: "c", historyDate: new Date("2026-07-02T00:00:00.000Z") }
    ];
    const groups = groupRowsByDate(rows);
    expect(groups.get("2026-07-01")?.map((r) => r.id)).toEqual(["a", "b"]);
    expect(groups.get("2026-07-02")?.map((r) => r.id)).toEqual(["c"]);
  });
});

describe("mergeArchivePayloads", () => {
  const base: ArchivePayload = {
    history_date: "2026-07-01",
    archived_at: "2026-07-08T03:00:00.000Z",
    tasks: [{ id: "t1", status: "NEW" }],
    plan_rows: [{ id: "p1" }]
  };

  it("returns incoming when there is no existing file", () => {
    expect(mergeArchivePayloads(null, base)).toBe(base);
  });

  it("dedupes by id — the incoming (newer) row wins", () => {
    const incoming: ArchivePayload = {
      history_date: "2026-07-01",
      archived_at: "2026-07-09T03:00:00.000Z",
      tasks: [
        { id: "t1", status: "DONE" },
        { id: "t2", status: "NEW" }
      ],
      plan_rows: [{ id: "p2" }]
    };
    const merged = mergeArchivePayloads(base, incoming);
    expect(merged.tasks).toHaveLength(2);
    expect(merged.tasks.find((t) => t.id === "t1")?.status).toBe("DONE");
    expect(merged.plan_rows.map((r) => r.id).sort()).toEqual(["p1", "p2"]);
    expect(merged.archived_at).toBe(incoming.archived_at);
  });
});

describe("archive files on disk (gzip round-trip)", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "produce-archive-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("writes, lists and reads an archive back losslessly", async () => {
    const payload: ArchivePayload = {
      history_date: "2026-07-01",
      archived_at: "2026-07-08T03:00:00.000Z",
      tasks: [{ id: "t1", lagerName: "Багет подовий гречаний", quantity: 0.5 }],
      plan_rows: [{ id: "p1", filialId: 3361 }]
    };

    await writeArchiveFile(dir, payload);

    const files = await listArchiveFiles(dir);
    expect(files).toHaveLength(1);
    expect(files[0].date).toBe("2026-07-01");
    expect(files[0].size_bytes).toBeGreaterThan(0);

    const read = await readArchiveFile(dir, "2026-07-01");
    expect(read).toEqual(payload);
  });

  it("returns null for a missing date and [] for a missing dir", async () => {
    expect(await readArchiveFile(dir, "2000-01-01")).toBeNull();
    expect(await listArchiveFiles(path.join(dir, "nope"))).toEqual([]);
  });

  it("ignores foreign files when listing", async () => {
    await writeFile(path.join(dir, "readme.txt"), "not an archive");
    await writeArchiveFile(dir, {
      history_date: "2026-07-02",
      archived_at: "2026-07-09T03:00:00.000Z",
      tasks: [],
      plan_rows: []
    });
    const files = await listArchiveFiles(dir);
    expect(files.map((f) => f.date)).toEqual(["2026-07-02"]);
  });

  it("lists newest date first", async () => {
    for (const d of ["2026-07-01", "2026-07-03", "2026-07-02"]) {
      await writeArchiveFile(dir, { history_date: d, archived_at: "x", tasks: [], plan_rows: [] });
    }
    const files = await listArchiveFiles(dir);
    expect(files.map((f) => f.date)).toEqual(["2026-07-03", "2026-07-02", "2026-07-01"]);
  });
});
