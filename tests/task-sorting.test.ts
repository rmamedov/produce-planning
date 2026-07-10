import { describe, expect, it } from "vitest";

import { priorityRank, readinessTime, sortKitchenTasks } from "@/lib/task-sorting";

const task = (id: string, priority: string, readyAt: string | null) => ({
  id,
  priority,
  operational_ready_at: readyAt
});

const ids = (tasks: Array<{ id: string }>) => tasks.map((t) => t.id);

describe("priorityRank", () => {
  it("orders Критичні → Високі → Нормальні", () => {
    expect(priorityRank("CRITICAL")).toBeLessThan(priorityRank("HIGH"));
    expect(priorityRank("HIGH")).toBeLessThan(priorityRank("MEDIUM"));
  });

  it("ranks LOW together with MEDIUM (both display as Нормальний)", () => {
    expect(priorityRank("LOW")).toBe(priorityRank("MEDIUM"));
  });

  it("puts unknown values last", () => {
    expect(priorityRank("???")).toBeGreaterThan(priorityRank("LOW"));
  });
});

describe("readinessTime", () => {
  it("parses the deadline and sends missing/invalid ones to the end", () => {
    expect(readinessTime("2026-07-10T09:00:00.000Z")).toBe(
      new Date("2026-07-10T09:00:00.000Z").getTime()
    );
    expect(readinessTime(null)).toBe(Number.POSITIVE_INFINITY);
    expect(readinessTime("not-a-date")).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("sortKitchenTasks — no priority filter ('all')", () => {
  it("groups by criticality, then nearest readiness first inside each group", () => {
    const tasks = [
      task("medium-early", "MEDIUM", "2026-07-10T08:00:00.000Z"),
      task("critical-late", "CRITICAL", "2026-07-10T12:00:00.000Z"),
      task("high-early", "HIGH", "2026-07-10T07:00:00.000Z"),
      task("critical-early", "CRITICAL", "2026-07-10T09:00:00.000Z"),
      task("high-late", "HIGH", "2026-07-10T11:00:00.000Z")
    ];

    expect(ids(sortKitchenTasks(tasks, "all"))).toEqual([
      "critical-early",
      "critical-late",
      "high-early",
      "high-late",
      "medium-early"
    ]);
  });

  it("a critical task outranks an earlier-deadline normal one", () => {
    const tasks = [
      task("medium", "MEDIUM", "2026-07-10T06:00:00.000Z"),
      task("critical", "CRITICAL", "2026-07-10T18:00:00.000Z")
    ];
    expect(ids(sortKitchenTasks(tasks, "all"))).toEqual(["critical", "medium"]);
  });

  it("interleaves LOW and MEDIUM by readiness within the Нормальні group", () => {
    const tasks = [
      task("medium-late", "MEDIUM", "2026-07-10T15:00:00.000Z"),
      task("low-early", "LOW", "2026-07-10T09:00:00.000Z")
    ];
    expect(ids(sortKitchenTasks(tasks, "all"))).toEqual(["low-early", "medium-late"]);
  });

  it("tasks without a deadline go last within their group", () => {
    const tasks = [
      task("critical-none", "CRITICAL", null),
      task("high-early", "HIGH", "2026-07-10T07:00:00.000Z"),
      task("critical-early", "CRITICAL", "2026-07-10T09:00:00.000Z")
    ];
    expect(ids(sortKitchenTasks(tasks, "all"))).toEqual([
      "critical-early",
      "critical-none",
      "high-early"
    ]);
  });
});

describe("sortKitchenTasks — concrete priority selected", () => {
  it("orders purely by readiness, ignoring criticality", () => {
    const tasks = [
      task("critical-late", "CRITICAL", "2026-07-10T12:00:00.000Z"),
      task("medium-early", "MEDIUM", "2026-07-10T08:00:00.000Z"),
      task("low-mid", "LOW", "2026-07-10T10:00:00.000Z")
    ];
    expect(ids(sortKitchenTasks(tasks, "MEDIUM"))).toEqual([
      "medium-early",
      "low-mid",
      "critical-late"
    ]);
  });

  it("does not mutate the input array", () => {
    const tasks = [
      task("b", "HIGH", "2026-07-10T12:00:00.000Z"),
      task("a", "CRITICAL", "2026-07-10T09:00:00.000Z")
    ];
    sortKitchenTasks(tasks, "all");
    expect(ids(tasks)).toEqual(["b", "a"]);
  });
});
