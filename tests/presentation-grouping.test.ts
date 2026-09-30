import { describe, expect, it } from "vitest";

import {
  buildLagerLanes,
  compareGroups,
  compareMembers,
  countBatches,
  distributeProduced,
  effectiveUnit,
  groupMatchesFilters,
  groupPresentationTasks,
  loadSummary,
  normPriority,
  plural,
  priorityRankOf,
  readyMs,
  type GroupableTask,
  type TaskGroup
} from "@/lib/presentation-grouping";

const at = (hhmm: string) => `2026-09-30T${hhmm}:00.000+03:00`;
const ms = (hhmm: string) => new Date(at(hhmm)).getTime();

let seq = 0;
function task(overrides: Partial<GroupableTask> = {}): GroupableTask {
  seq += 1;
  return {
    id: `t${String(seq).padStart(3, "0")}`,
    filial_id: 3361,
    lager_id: 437495,
    lager_name: "Круасан, 50г",
    unit: "шт",
    status: "NEW",
    priority: "MEDIUM",
    quantity: 10,
    operational_ready_at: null,
    history_date: "2026-09-30",
    batch_id: null,
    started_at: null,
    promo_mechanics: null,
    is_guest_promise: false,
    ecom_orders_qty: null,
    bakery_type: "Кондитерська",
    ...overrides
  };
}

const croissant = (filial_id: number, quantity: number, hhmm: string, priority: string) =>
  task({ filial_id, quantity, priority, operational_ready_at: at(hhmm) });

const readiness = (group: TaskGroup<GroupableTask>) =>
  group.members.map((member) => member.operational_ready_at?.slice(11, 16));

describe("small helpers", () => {
  it("effectiveUnit: only шт is pieces, null counts as кг (like the board card)", () => {
    expect(effectiveUnit("шт")).toBe("шт");
    expect(effectiveUnit("кг")).toBe("кг");
    expect(effectiveUnit(null)).toBe("кг");
    expect(effectiveUnit(undefined)).toBe("кг");
    expect(effectiveUnit("л")).toBe("кг");
  });

  it("normPriority: LOW and unknown collapse to MEDIUM", () => {
    expect(normPriority("CRITICAL")).toBe("CRITICAL");
    expect(normPriority("HIGH")).toBe("HIGH");
    expect(normPriority("MEDIUM")).toBe("MEDIUM");
    expect(normPriority("LOW")).toBe("MEDIUM");
    expect(normPriority("???")).toBe("MEDIUM");
  });

  it("priorityRankOf: CRITICAL 0, HIGH 1, MEDIUM/LOW 2, unknown 3", () => {
    expect(priorityRankOf("CRITICAL")).toBe(0);
    expect(priorityRankOf("HIGH")).toBe(1);
    expect(priorityRankOf("MEDIUM")).toBe(2);
    expect(priorityRankOf("LOW")).toBe(2);
    expect(priorityRankOf("???")).toBe(3);
  });

  it("readyMs floors to the minute; missing/invalid → null", () => {
    expect(readyMs("2026-09-30T09:10:45.500+03:00")).toBe(ms("09:10"));
    expect(readyMs(at("09:10"))).toBe(ms("09:10"));
    expect(readyMs(null)).toBeNull();
    expect(readyMs("not-a-date")).toBeNull();
  });

  it("compareMembers: priority, readiness (none last), filial, history date, id", () => {
    const rows = [
      task({ id: "e", priority: "MEDIUM", operational_ready_at: null, filial_id: 1 }),
      task({ id: "d", priority: "LOW", operational_ready_at: at("08:00"), filial_id: 9 }),
      task({ id: "c", priority: "MEDIUM", operational_ready_at: at("08:00"), filial_id: 2 }),
      task({ id: "b", priority: "HIGH", operational_ready_at: at("12:00"), filial_id: 5 }),
      task({ id: "a", priority: "CRITICAL", operational_ready_at: at("15:00"), filial_id: 5 }),
      task({ id: "g", priority: "MEDIUM", operational_ready_at: at("08:00"), filial_id: 2, history_date: "2026-09-29" }),
      task({ id: "f", priority: "MEDIUM", operational_ready_at: at("08:00"), filial_id: 2, history_date: "2026-09-29" })
    ];
    expect([...rows].sort(compareMembers).map((row) => row.id)).toEqual([
      "a",
      "b",
      "f",
      "g",
      "c",
      "d",
      "e"
    ]);
  });
});

describe("groupPresentationTasks — the worked example (Круасан)", () => {
  it("W = 5 год: 09:10 / 10:05 / 12:10 form one batch, 17:20 another", () => {
    const tasks = [
      croissant(3361, 24, "09:10", "CRITICAL"),
      croissant(2048, 18, "10:05", "HIGH"),
      croissant(2043, 30, "12:10", "MEDIUM"),
      croissant(2048, 16, "17:20", "MEDIUM")
    ];
    const groups = groupPresentationTasks(tasks, 300);

    expect(groups).toHaveLength(2);
    const [first, second] = groups;
    expect(first.kind).toBe("window");
    expect(first.status).toBe("NEW");
    expect(first.key).toBe(`new:437495:шт:${tasks[0].id}`);
    expect(first.members.map((m) => m.filial_id)).toEqual([3361, 2048, 2043]);
    expect(first.total).toBe(72);
    expect(first.priority).toBe("CRITICAL");
    expect(first.deadline).toBe(ms("09:10"));
    expect(first.last).toBe(ms("12:10"));
    expect(first.filialIds).toEqual([2043, 2048, 3361]);
    expect(first.lagerName).toBe("Круасан, 50г");
    expect(first.unit).toBe("шт");

    expect(second.key).toBe(`new:437495:шт:${tasks[3].id}`);
    expect(second.total).toBe(16);
    expect(second.priority).toBe("MEDIUM");
    expect(second.deadline).toBe(ms("17:20"));
    expect(second.last).toBe(ms("17:20"));
  });

  it("W = 3 год over 2 filials: the boundary is inclusive (12:10 = 09:10 + 3 год joins)", () => {
    const filials = [3361, 2048];
    const tasks = ["09:10", "10:05", "12:10", "17:20"].map((hhmm, index) =>
      croissant(filials[index % 2], 10, hhmm, "MEDIUM")
    );
    const groups = groupPresentationTasks(tasks, 180);

    expect(groups.map(readiness)).toEqual([["09:10", "10:05", "12:10"], ["17:20"]]);
    expect(groups[0].filialIds).toEqual([2048, 3361]);
    expect(groups[0].members.map((m) => m.filial_id)).toEqual([3361, 2048, 3361]);
    expect(groups[0].total).toBe(30);
  });

  it("one minute less and 12:10 anchors its own batch", () => {
    const tasks = ["09:10", "10:05", "12:10", "17:20"].map((hhmm) =>
      croissant(3361, 10, hhmm, "MEDIUM")
    );
    expect(groupPresentationTasks(tasks, 179).map(readiness)).toEqual([
      ["09:10", "10:05"],
      ["12:10"],
      ["17:20"]
    ]);
  });

  it("windows are anchored at the earliest ungrouped task, not chained", () => {
    const tasks = ["09:00", "11:00", "13:00"].map((hhmm) => croissant(3361, 5, hhmm, "MEDIUM"));
    expect(groupPresentationTasks(tasks, 180).map(readiness)).toEqual([
      ["09:00", "11:00"],
      ["13:00"]
    ]);
  });

  it("seconds do not matter — readiness is compared by the minute", () => {
    const tasks = [
      task({ operational_ready_at: "2026-09-30T09:00:59.000+03:00" }),
      task({ operational_ready_at: "2026-09-30T10:00:30.000+03:00" })
    ];
    expect(groupPresentationTasks(tasks, 60)).toHaveLength(1);
  });

  it("W = 0 groups only tasks ready in the same minute; invalid W acts as 0", () => {
    const tasks = [
      croissant(3361, 5, "09:00", "MEDIUM"),
      croissant(2048, 5, "09:00", "MEDIUM"),
      croissant(2043, 5, "09:01", "MEDIUM")
    ];
    expect(groupPresentationTasks(tasks, 0).map((g) => g.members.length)).toEqual([2, 1]);
    expect(groupPresentationTasks(tasks, Number.NaN).map((g) => g.members.length)).toEqual([2, 1]);
  });
});

describe("groupPresentationTasks — frozen batches", () => {
  it("an IN_PROGRESS batch is never split by the window and a NEW task near it forms its own batch", () => {
    const running = [
      task({ status: "IN_PROGRESS", batch_id: "b1", filial_id: 3361, quantity: 10, operational_ready_at: at("09:00"), started_at: at("08:55") }),
      task({ status: "IN_PROGRESS", batch_id: "b1", filial_id: 2048, quantity: 12, operational_ready_at: at("15:00"), started_at: at("08:50") })
    ];
    const fresh = task({ filial_id: 2043, quantity: 7, operational_ready_at: at("09:30") });
    const groups = groupPresentationTasks([...running, fresh], 60);

    expect(groups).toHaveLength(2);
    const batch = groups.find((g) => g.kind === "batch")!;
    expect(batch.key).toBe("batch:b1");
    expect(batch.status).toBe("IN_PROGRESS");
    expect(batch.members.map((m) => m.id)).toEqual(running.map((m) => m.id));
    expect(batch.total).toBe(22);
    expect(batch.deadline).toBe(ms("09:00"));
    expect(batch.last).toBe(ms("15:00"));
    expect(batch.startedAt).toBe(at("08:50"));

    const window = groups.find((g) => g.kind === "window")!;
    expect(window.key).toBe(`new:437495:шт:${fresh.id}`);
    expect(window.members).toEqual([fresh]);
    expect(window.startedAt).toBeNull();
  });

  it("different batch ids stay apart; a task without batch_id is a batch of one", () => {
    const a = task({ status: "IN_PROGRESS", batch_id: "b1", operational_ready_at: at("09:00") });
    const b = task({ status: "IN_PROGRESS", batch_id: "b2", operational_ready_at: at("09:00") });
    const c = task({ status: "IN_PROGRESS", batch_id: null, operational_ready_at: at("09:00") });
    const keys = groupPresentationTasks([a, b, c], 300).map((g) => g.key);
    expect(keys.sort()).toEqual(["batch:b1", "batch:b2", `batch:task:${c.id}`].sort());
  });

  it("a batch whose members lost their readiness has no deadline", () => {
    const [group] = groupPresentationTasks(
      [task({ status: "IN_PROGRESS", batch_id: "b1", operational_ready_at: null })],
      300
    );
    expect(group.kind).toBe("batch");
    expect(group.deadline).toBeNull();
    expect(group.last).toBeNull();
  });

  it("a batch mixing articles or units (API misuse) is split, never summed across units", () => {
    const pcs = task({ status: "IN_PROGRESS", batch_id: "mix", unit: "шт", quantity: 4 });
    const kg = task({ status: "IN_PROGRESS", batch_id: "mix", unit: "кг", quantity: 1.5 });
    const other = task({ status: "IN_PROGRESS", batch_id: "mix", lager_id: 1, unit: "шт", quantity: 2 });
    const groups = groupPresentationTasks([pcs, kg, other], 300);
    expect(groups.map((g) => [g.key, g.total]).sort()).toEqual(
      [
        ["batch:mix:1:шт", 2],
        ["batch:mix:437495:кг", 1.5],
        ["batch:mix:437495:шт", 4]
      ].sort()
    );
  });

  it("ignores DONE and CANCELLED tasks", () => {
    const groups = groupPresentationTasks(
      [
        task({ status: "DONE", operational_ready_at: at("09:00") }),
        task({ status: "CANCELLED", operational_ready_at: at("09:00") })
      ],
      300
    );
    expect(groups).toEqual([]);
  });
});

describe("groupPresentationTasks — no time, units, aggregates", () => {
  it("NEW tasks without (valid) readiness form one «Без часу» batch per article, sorted last", () => {
    const timed = croissant(3361, 5, "20:00", "MEDIUM");
    const untimedA = task({ filial_id: 3361, quantity: 3 });
    const untimedB = task({ filial_id: 2048, quantity: 4, operational_ready_at: "garbage" });
    const groups = groupPresentationTasks([untimedA, timed, untimedB], 300);

    expect(groups.map((g) => g.kind)).toEqual(["window", "no_time"]);
    const none = groups[1];
    expect(none.key).toBe("none:437495:шт");
    expect(none.deadline).toBeNull();
    expect(none.last).toBeNull();
    expect(none.total).toBe(7);
    expect(none.filialIds).toEqual([2048, 3361]);
  });

  it("partitions by unit: шт and кг of the same article never share a batch; null unit is кг", () => {
    const groups = groupPresentationTasks(
      [
        task({ unit: "шт", quantity: 3, operational_ready_at: at("09:00") }),
        task({ unit: "кг", quantity: 1.5, operational_ready_at: at("09:10") }),
        task({ unit: null, quantity: 0.5, operational_ready_at: at("09:20") })
      ],
      300
    );
    expect(groups.map((g) => [g.unit, g.total, g.members.length])).toEqual([
      ["шт", 3, 1],
      ["кг", 2, 2]
    ]);
  });

  it("different articles never share a batch", () => {
    const groups = groupPresentationTasks(
      [
        task({ lager_id: 1, operational_ready_at: at("09:00") }),
        task({ lager_id: 2, operational_ready_at: at("09:00") })
      ],
      300
    );
    expect(groups.map((g) => g.lagerId)).toEqual([1, 2]);
  });

  it("group priority is the most critical member; LOW counts as MEDIUM", () => {
    const low = groupPresentationTasks(
      [task({ priority: "LOW", operational_ready_at: at("09:00") })],
      300
    );
    expect(low[0].priority).toBe("MEDIUM");

    const mixed = groupPresentationTasks(
      [
        task({ priority: "LOW", operational_ready_at: at("09:00") }),
        task({ priority: "HIGH", operational_ready_at: at("09:30") })
      ],
      300
    );
    expect(mixed[0].priority).toBe("HIGH");
  });

  it("кг totals round to 0.1 without float noise", () => {
    const [group] = groupPresentationTasks(
      [
        task({ unit: "кг", quantity: 0.1, operational_ready_at: at("09:00") }),
        task({ unit: "кг", quantity: 0.2, operational_ready_at: at("09:00") })
      ],
      300
    );
    expect(group.total).toBe(0.3);
  });

  it("aggregates promo (split by «/», union), guest promise, e-com, bakery type and name", () => {
    const [group] = groupPresentationTasks(
      [
        task({ lager_name: null, bakery_type: null, promo_mechanics: "знижка/кешбек", operational_ready_at: at("09:00") }),
        task({ lager_name: " Круасан, 50г ", bakery_type: null, promo_mechanics: "кешбек", is_guest_promise: true, ecom_orders_qty: 3, operational_ready_at: at("09:10") }),
        task({ lager_name: "", ecom_orders_qty: 2, bakery_type: "Пекарня", operational_ready_at: at("09:20") })
      ],
      300
    );
    expect(group.promoMechanics).toEqual(["знижка", "кешбек"]);
    expect(group.guest).toBe(true);
    expect(group.ecomTotal).toBe(5);
    expect(group.bakeryType).toBe("Пекарня");
    expect(group.lagerName).toBe("Круасан, 50г");
  });

  it("falls back to «Lager <id>» when no member has a name", () => {
    const [group] = groupPresentationTasks(
      [task({ lager_id: 42, lager_name: null, operational_ready_at: at("09:00") })],
      300
    );
    expect(group.lagerName).toBe("Lager 42");
  });
});

describe("compareGroups / groupMatchesFilters", () => {
  const critLate = groupPresentationTasks(
    [task({ lager_id: 1, priority: "CRITICAL", operational_ready_at: at("12:00") })],
    300
  )[0];
  const mediumEarly = groupPresentationTasks(
    [task({ lager_id: 2, priority: "MEDIUM", operational_ready_at: at("09:00") })],
    300
  )[0];
  const mediumNoTime = groupPresentationTasks([task({ lager_id: 3, priority: "MEDIUM" })], 300)[0];
  const running = groupPresentationTasks(
    [task({ lager_id: 4, status: "IN_PROGRESS", batch_id: "b", priority: "HIGH", operational_ready_at: at("10:00") })],
    300
  )[0];

  const order = (groups: TaskGroup<GroupableTask>[], priority: string) =>
    [...groups].sort((a, b) => compareGroups(a, b, priority)).map((g) => g.lagerId);

  it("with «all»: priority tiers first, then deadline", () => {
    expect(order([mediumNoTime, mediumEarly, running, critLate], "all")).toEqual([1, 4, 2, 3]);
  });

  it("with a concrete priority: deadline only (null last)", () => {
    expect(order([mediumNoTime, mediumEarly, running, critLate], "MEDIUM")).toEqual([2, 4, 1, 3]);
  });

  it("equal deadlines fall back to lager id, then key", () => {
    const [a, b] = groupPresentationTasks(
      [
        task({ lager_id: 7, operational_ready_at: at("09:00") }),
        task({ lager_id: 7, unit: "кг", operational_ready_at: at("09:00") })
      ],
      300
    );
    const c = groupPresentationTasks([task({ lager_id: 5, operational_ready_at: at("09:00") })], 300)[0];
    expect([a, b, c].sort((x, y) => compareGroups(x, y, "all")).map((g) => g.key)).toEqual([
      c.key,
      ...[a.key, b.key].sort()
    ]);
  });

  it("filters whole batches by status and group priority (MEDIUM covers LOW)", () => {
    expect(groupMatchesFilters(running, "all", "all")).toBe(true);
    expect(groupMatchesFilters(running, "IN_PROGRESS", "HIGH")).toBe(true);
    expect(groupMatchesFilters(running, "NEW", "all")).toBe(false);
    expect(groupMatchesFilters(running, "all", "CRITICAL")).toBe(false);
    expect(groupMatchesFilters(critLate, "NEW", "CRITICAL")).toBe(true);
    expect(groupMatchesFilters(mediumEarly, "all", "MEDIUM")).toBe(true);
    expect(groupMatchesFilters(mediumEarly, "all", "LOW")).toBe(true);
  });

  it("a mixed batch is shown whole under its most critical priority only", () => {
    const [mixed] = groupPresentationTasks(
      [
        task({ priority: "CRITICAL", operational_ready_at: at("09:00") }),
        task({ priority: "MEDIUM", operational_ready_at: at("09:30") })
      ],
      300
    );
    expect(groupMatchesFilters(mixed, "all", "CRITICAL")).toBe(true);
    expect(groupMatchesFilters(mixed, "all", "MEDIUM")).toBe(false);
  });
});

describe("buildLagerLanes", () => {
  const tasks = [
    task({ id: "l1-medium", lager_id: 1, lager_name: "Багет", priority: "MEDIUM", quantity: 5, operational_ready_at: at("09:00") }),
    task({ id: "l1-critical", lager_id: 1, lager_name: "Багет", priority: "CRITICAL", quantity: 7, operational_ready_at: at("14:00") }),
    task({ id: "l2-high", lager_id: 2, lager_name: "Самса", priority: "HIGH", quantity: 3, operational_ready_at: at("08:00") }),
    task({ id: "l3-critical", lager_id: 3, lager_name: "Піца", priority: "CRITICAL", quantity: 2, operational_ready_at: at("10:00") })
  ];
  const groups = groupPresentationTasks(tasks, 60);

  it("one lane per article; lanes ordered by their best batch, batches inside by deadline", () => {
    const lanes = buildLagerLanes(groups, "all");
    expect(lanes.map((lane) => lane.lagerId)).toEqual([3, 1, 2]);
    expect(lanes.map((lane) => lane.bestPriority)).toEqual(["CRITICAL", "CRITICAL", "HIGH"]);

    const baguette = lanes[1];
    expect(baguette.key).toBe("lane:1:шт");
    expect(baguette.lagerName).toBe("Багет");
    expect(baguette.unit).toBe("шт");
    expect(baguette.groups.map((g) => g.members[0].id)).toEqual(["l1-medium", "l1-critical"]);
    expect(baguette.total).toBe(12);
  });

  it("with a concrete priority filter lanes follow the earliest batch", () => {
    expect(buildLagerLanes(groups, "HIGH").map((lane) => lane.lagerId)).toEqual([2, 1, 3]);
  });

  it("the same article in шт and кг gets two lanes; «Без часу» batches close their lane", () => {
    const lanes = buildLagerLanes(
      groupPresentationTasks(
        [
          task({ lager_id: 9, unit: "кг", quantity: 1.5, operational_ready_at: at("09:00") }),
          task({ lager_id: 9, unit: "кг", quantity: 0.5, operational_ready_at: at("20:00") }),
          task({ lager_id: 9, unit: "кг", quantity: 1 }),
          task({ lager_id: 9, unit: "шт", quantity: 4, operational_ready_at: at("10:00") })
        ],
        60
      ),
      "all"
    );
    expect(lanes.map((lane) => [lane.key, lane.total])).toEqual([
      ["lane:9:кг", 3],
      ["lane:9:шт", 4]
    ]);
    expect(lanes[0].groups.map((g) => g.kind)).toEqual(["window", "window", "no_time"]);
  });

  it("returns no lanes for no groups", () => {
    expect(buildLagerLanes([], "all")).toEqual([]);
  });
});

describe("distributeProduced", () => {
  const sumUnits = (parts: number[], unit: "шт" | "кг") =>
    parts.reduce((sum, part) => sum + Math.round(part * (unit === "кг" ? 10 : 1)), 0);

  it("exactly as ordered", () => {
    expect(distributeProduced(72, [24, 18, 30], "шт")).toEqual([24, 18, 30]);
  });

  it("shortage goes to the least urgent rows (72 → 66 = 24/18/24)", () => {
    expect(distributeProduced(66, [24, 18, 30], "шт")).toEqual([24, 18, 24]);
    expect(distributeProduced(30, [24, 18, 30], "шт")).toEqual([24, 6, 0]);
  });

  it("surplus is proportional, leftovers to the largest remainders (80 = 27/20/33)", () => {
    expect(distributeProduced(80, [24, 18, 30], "шт")).toEqual([27, 20, 33]);
  });

  it("remainder ties go to the more urgent row", () => {
    expect(distributeProduced(21, [10, 10], "шт")).toEqual([11, 10]);
  });

  it("zero (or negative) total gives zeros", () => {
    expect(distributeProduced(0, [24, 18, 30], "шт")).toEqual([0, 0, 0]);
    expect(distributeProduced(-5, [24, 18], "шт")).toEqual([0, 0]);
  });

  it("кг works in 0.1 steps (3,5 → 3 = 1,5 + 1,5; 4 = 1,7 + 2,3)", () => {
    expect(distributeProduced(3, [1.5, 2], "кг")).toEqual([1.5, 1.5]);
    expect(distributeProduced(4, [1.5, 2], "кг")).toEqual([1.7, 2.3]);
    expect(distributeProduced(0.3, [0.1, 0.2], "кг")).toEqual([0.1, 0.2]);
  });

  it("шт totals are whole pieces", () => {
    expect(distributeProduced(10.4, [5, 5], "шт")).toEqual([5, 5]);
  });

  it("nothing ordered: an even split, extra steps to the most urgent rows", () => {
    expect(distributeProduced(5, [0, 0], "шт")).toEqual([3, 2]);
    expect(distributeProduced(5, [], "шт")).toEqual([]);
  });

  it("the parts always add up to the total", () => {
    const cases: Array<[number, number[], "шт" | "кг"]> = [
      [1, [3, 3, 3], "шт"],
      [100, [1, 2, 3, 4], "шт"],
      [17, [7, 7, 7], "шт"],
      [9.9, [1.5, 2.5, 0.5], "кг"],
      [12.3, [2, 2, 2], "кг"],
      [0.7, [0.5, 0.5, 0.5], "кг"]
    ];
    for (const [total, ordered, unit] of cases) {
      const parts = distributeProduced(total, ordered, unit);
      expect(parts).toHaveLength(ordered.length);
      expect(sumUnits(parts, unit)).toBe(Math.round(total * (unit === "кг" ? 10 : 1)));
      parts.forEach((part) => expect(part).toBeGreaterThanOrEqual(0));
    }
  });
});

describe("countBatches", () => {
  it("counts running batches plus windows over NEW tasks, ignoring finished ones", () => {
    const tasks = [
      croissant(3361, 24, "09:10", "CRITICAL"),
      croissant(2048, 18, "10:05", "HIGH"),
      croissant(2043, 30, "12:10", "MEDIUM"),
      croissant(2048, 16, "17:20", "MEDIUM"),
      task({ lager_id: 2, status: "IN_PROGRESS", batch_id: "b1", operational_ready_at: at("10:15") }),
      task({ lager_id: 2, status: "IN_PROGRESS", batch_id: "b1", operational_ready_at: at("10:40") }),
      task({ lager_id: 3, status: "DONE", operational_ready_at: at("08:00") })
    ];
    expect(countBatches(tasks, 300)).toBe(3);
    expect(countBatches(tasks, 180)).toBe(3);
    expect(countBatches(tasks, 60)).toBe(4);
    expect(countBatches([], 300)).toBe(0);
  });
});

describe("loadSummary", () => {
  it("splits by the horizon (inclusive), sums units apart and counts overdue", () => {
    const groups = groupPresentationTasks(
      [
        task({ lager_id: 1, unit: "шт", quantity: 24, operational_ready_at: at("09:10") }),
        task({ lager_id: 2, unit: "кг", quantity: 1.5, operational_ready_at: at("10:30") }),
        task({ lager_id: 3, unit: "шт", quantity: 12, operational_ready_at: at("14:42") }),
        task({ lager_id: 4, unit: "шт", quantity: 16, operational_ready_at: at("17:20") }),
        task({ lager_id: 5, unit: "кг", quantity: 2.5 })
      ],
      60
    );
    const summary = loadSummary(groups, ms("09:42"), 300);

    expect(summary.soon).toEqual({ count: 3, pcs: 36, kg: 1.5 });
    expect(summary.later).toEqual({ count: 2, pcs: 16, kg: 2.5 });
    expect(summary.overdue).toBe(1);
  });

  it("is empty for no groups", () => {
    expect(loadSummary([], ms("09:00"), 300)).toEqual({
      soon: { count: 0, pcs: 0, kg: 0 },
      later: { count: 0, pcs: 0, kg: 0 },
      overdue: 0
    });
  });
});

describe("plural (Ukrainian)", () => {
  const forms: [string, string, string] = ["партія", "партії", "партій"];

  it.each([
    [0, "партій"],
    [1, "партія"],
    [2, "партії"],
    [4, "партії"],
    [5, "партій"],
    [11, "партій"],
    [12, "партій"],
    [14, "партій"],
    [21, "партія"],
    [22, "партії"],
    [25, "партій"],
    [101, "партія"],
    [111, "партій"]
  ])("%i → %s", (n, expected) => {
    expect(plural(n, forms)).toBe(expected);
  });

  it("fractions take the second form («1,5 філії»)", () => {
    expect(plural(1.5, ["філія", "філії", "філій"])).toBe("філії");
  });
});
