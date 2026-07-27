import { describe, expect, it } from "vitest";

import {
  CANCELLED_BY_COVERAGE_REASON,
  decideMutation,
  mapPriorityLevel,
  nextMaxQuantity,
  operationalReadyAtFor,
  resolveNaming,
  shouldReopenDone,
  snapshotTimestamp
} from "@/lib/task-generation";

describe("decideMutation", () => {
  it("nothing to produce: cancels a NEW task, otherwise skips", () => {
    expect(decideMutation(0, "NEW")).toBe("cancel");
    expect(decideMutation(0, null)).toBe("skip");
    expect(decideMutation(0, "IN_PROGRESS")).toBe("skip");
    expect(decideMutation(0, "DONE")).toBe("skip");
    expect(decideMutation(0, "CANCELLED")).toBe("skip");
    expect(decideMutation(-1, "NEW")).toBe("cancel");
  });

  it("never overwrites started or finished work by default", () => {
    expect(decideMutation(5, "IN_PROGRESS")).toBe("unchanged");
    expect(decideMutation(5, "DONE")).toBe("unchanged");
    expect(decideMutation(5, "DONE", { reopenDone: false })).toBe("unchanged");
  });

  it("reopens a DONE task only when explicitly allowed", () => {
    expect(decideMutation(5, "DONE", { reopenDone: true })).toBe("update");
    // reopenDone never resurrects tasks with nothing to produce…
    expect(decideMutation(0, "DONE", { reopenDone: true })).toBe("skip");
    // …and never touches work in progress.
    expect(decideMutation(5, "IN_PROGRESS", { reopenDone: true })).toBe("unchanged");
  });

  it("creates when there is no task, refreshes NEW/CANCELLED ones", () => {
    expect(decideMutation(5, null)).toBe("create");
    expect(decideMutation(5, "NEW")).toBe("update");
    expect(decideMutation(5, "CANCELLED")).toBe("update");
  });
});

describe("snapshotTimestamp", () => {
  const historyDate = new Date("2026-07-10T00:00:00.000Z");

  it("interprets snapshot_hour as Kyiv time (UTC+3)", () => {
    expect(snapshotTimestamp(historyDate, 10)?.toISOString()).toBe("2026-07-10T07:00:00.000Z");
    // Midnight Kyiv is 21:00 UTC the previous day.
    expect(snapshotTimestamp(historyDate, 0)?.toISOString()).toBe("2026-07-09T21:00:00.000Z");
  });

  it("returns null without a snapshot hour", () => {
    expect(snapshotTimestamp(historyDate, null)).toBeNull();
  });
});

describe("shouldReopenDone", () => {
  const historyDate = new Date("2026-07-10T00:00:00.000Z");
  // Snapshot at 10:00 Kyiv = 07:00 UTC.
  const row = { recommendedToProduce: 5, historyDate, snapshotHour: 10 };

  it("reopens when the stock snapshot is newer than the completion", () => {
    expect(shouldReopenDone(row, new Date("2026-07-09T11:14:00.000Z"))).toBe(true);
    expect(shouldReopenDone(row, new Date("2026-07-10T05:32:00.000Z"))).toBe(true);
  });

  it("keeps just-finished work: snapshot older than the completion", () => {
    expect(shouldReopenDone(row, new Date("2026-07-10T07:15:00.000Z"))).toBe(false);
    expect(shouldReopenDone(row, new Date("2026-07-10T07:00:00.000Z"))).toBe(false); // ties stay closed
  });

  it("requires demand, a completion time and a snapshot hour", () => {
    expect(shouldReopenDone({ ...row, recommendedToProduce: 0 }, new Date("2026-07-09T11:14:00.000Z"))).toBe(false);
    expect(shouldReopenDone(row, null)).toBe(false);
    expect(shouldReopenDone({ ...row, snapshotHour: null }, new Date("2026-07-09T11:14:00.000Z"))).toBe(false);
  });
});

describe("nextMaxQuantity", () => {
  it("grows to a bigger order and keeps the peak on smaller ones", () => {
    expect(nextMaxQuantity(5, 8)).toBe(8);
    expect(nextMaxQuantity(8, 5)).toBe(8);
    expect(nextMaxQuantity(8, 8)).toBe(8);
  });

  it("a forecast dropping the order to zero never erases the peak", () => {
    expect(nextMaxQuantity(8, 0)).toBe(8);
  });

  it("treats a missing stored peak (legacy rows) as zero", () => {
    expect(nextMaxQuantity(null, 3)).toBe(3);
    expect(nextMaxQuantity(undefined, 3)).toBe(3);
    expect(nextMaxQuantity(null, 0)).toBe(0);
  });
});

describe("mapPriorityLevel", () => {
  it("maps plan levels to task priorities", () => {
    expect(mapPriorityLevel(1).priority).toBe("CRITICAL");
    expect(mapPriorityLevel(2).priority).toBe("HIGH");
    expect(mapPriorityLevel(3).priority).toBe("MEDIUM");
    expect(mapPriorityLevel(4).priority).toBe("LOW");
    expect(mapPriorityLevel(99).priority).toBe("LOW");
  });

  it("always provides a Ukrainian explanation", () => {
    for (const level of [1, 2, 3, 4]) {
      expect(mapPriorityLevel(level).reason.length).toBeGreaterThan(10);
    }
    expect(CANCELLED_BY_COVERAGE_REASON).toContain("скасоване");
  });
});

describe("operationalReadyAtFor", () => {
  it("adds covered_hours to the forecast receipt time", () => {
    const receivedAt = new Date("2026-07-10T09:00:00.000Z");
    expect(operationalReadyAtFor(receivedAt, 2.5).toISOString()).toBe("2026-07-10T11:30:00.000Z");
    expect(operationalReadyAtFor(receivedAt, 0).toISOString()).toBe("2026-07-10T09:00:00.000Z");
  });
});

describe("resolveNaming — source preference", () => {
  it("prefers plan > known > silpo > existing", () => {
    expect(
      resolveNaming({ plan: "П", known: "З", silpo: "С", existing: "І" })
    ).toBe("П");
    expect(resolveNaming({ plan: null, known: "З", silpo: "С", existing: "І" })).toBe("З");
    expect(resolveNaming({ plan: null, known: null, silpo: "С", existing: "І" })).toBe("С");
    expect(resolveNaming({ plan: null, known: null, silpo: null, existing: "І" })).toBe("І");
  });

  it("returns null when no source has a value", () => {
    expect(resolveNaming({})).toBeNull();
    expect(resolveNaming({ plan: null, silpo: null })).toBeNull();
  });
});
