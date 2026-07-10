import { describe, expect, it } from "vitest";

import {
  CANCELLED_BY_COVERAGE_REASON,
  decideMutation,
  mapPriorityLevel,
  operationalReadyAtFor,
  resolveNaming
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

  it("never overwrites started or finished work", () => {
    expect(decideMutation(5, "IN_PROGRESS")).toBe("unchanged");
    expect(decideMutation(5, "DONE")).toBe("unchanged");
  });

  it("creates when there is no task, refreshes NEW/CANCELLED ones", () => {
    expect(decideMutation(5, null)).toBe("create");
    expect(decideMutation(5, "NEW")).toBe("update");
    expect(decideMutation(5, "CANCELLED")).toBe("update");
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
