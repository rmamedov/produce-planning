import { describe, expect, it } from "vitest";

import {
  activeTasksLabel,
  batchCountLabel,
  buildGroupingExample,
  filialCountLabel,
  filialCountWarning,
  findOverlaps,
  formatFilialsLine,
  formatHours,
  formatMinuteOfDay,
  formatProducerLine,
  isDuplicateName,
  isValidWindowHours,
  parseHoursInput,
  stepHours
} from "@/features/presentations/presentation-form";
import type { Presentation } from "@/features/production-tasks/types";

const presentation = (id: string, name: string, filial_ids: number[], window_hours = 5): Presentation => ({
  id,
  name,
  filial_ids,
  window_hours,
  window_minutes: window_hours * 60,
  production_filial_id: null
});

const SHORT: Record<number, string> = { 3361: "Березнева", 2048: "Січових Стрільців", 2043: "Дніпровська Наб. 33" };
const shortName = (id: number) => SHORT[id] ?? `Філія ${id}`;

describe("formatHours / parseHoursInput", () => {
  it("formats with a decimal comma", () => {
    expect(formatHours(5)).toBe("5");
    expect(formatHours(0.5)).toBe("0,5");
    expect(formatHours(7.5)).toBe("7,5");
    expect(formatHours(24)).toBe("24");
  });

  it("accepts comma or dot", () => {
    expect(parseHoursInput("5")).toBe(5);
    expect(parseHoursInput("0,5")).toBe(0.5);
    expect(parseHoursInput(" 7.5 ")).toBe(7.5);
    expect(parseHoursInput(",5")).toBe(0.5);
    expect(parseHoursInput("5,")).toBe(5);
  });

  it("rejects garbage", () => {
    expect(parseHoursInput("")).toBeNull();
    expect(parseHoursInput("абв")).toBeNull();
    expect(parseHoursInput("1e1")).toBeNull();
    expect(parseHoursInput("-2")).toBeNull();
    expect(parseHoursInput("1,5,5")).toBeNull();
  });

  it("validates the 0.5–24 h half-hour grid", () => {
    expect(isValidWindowHours(0.5)).toBe(true);
    expect(isValidWindowHours(24)).toBe(true);
    expect(isValidWindowHours(7.5)).toBe(true);
    expect(isValidWindowHours(0.25)).toBe(false);
    expect(isValidWindowHours(25)).toBe(false);
    expect(isValidWindowHours(7.3)).toBe(false);
    expect(isValidWindowHours(null)).toBe(false);
  });
});

describe("stepHours", () => {
  it("steps by half an hour", () => {
    expect(stepHours("5", 1)).toBe("5,5");
    expect(stepHours("5", -1)).toBe("4,5");
    expect(stepHours("0,5", 1)).toBe("1");
  });

  it("clamps to 0.5–24", () => {
    expect(stepHours("0,5", -1)).toBe("0,5");
    expect(stepHours("24", 1)).toBe("24");
    expect(stepHours("30", -1)).toBe("24");
    expect(stepHours("0", 1)).toBe("0,5");
  });

  it("snaps an off-grid value to the neighbouring step", () => {
    expect(stepHours("7,3", 1)).toBe("7,5");
    expect(stepHours("7,3", -1)).toBe("7");
  });

  it("starts from the default when the input is unparseable", () => {
    expect(stepHours("", 1)).toBe("5,5");
    expect(stepHours("abc", -1)).toBe("4,5");
  });
});

describe("labels", () => {
  it("uses Ukrainian plural forms", () => {
    expect(filialCountLabel(1)).toBe("1 філія");
    expect(filialCountLabel(3)).toBe("3 філії");
    expect(filialCountLabel(5)).toBe("5 філій");
    expect(batchCountLabel(1)).toBe("1 партію");
    expect(batchCountLabel(2)).toBe("2 партії");
    expect(batchCountLabel(11)).toBe("11 партій");
    expect(activeTasksLabel(7)).toBe("7 активних задач");
    expect(activeTasksLabel(21)).toBe("21 активна задача");
    expect(activeTasksLabel(0)).toBe("0 активних задач");
  });

  it("lists filials by short name", () => {
    expect(formatFilialsLine([3361, 2048, 2043], shortName)).toBe(
      "3 філії: Березнева · Січових Стрільців · Дніпровська Наб. 33"
    );
  });

  it("names the production filial only when one is set", () => {
    expect(formatProducerLine(3361, shortName)).toBe("Виробник: Березнева");
    expect(formatProducerLine(null, shortName)).toBeNull();
  });
});

describe("isDuplicateName", () => {
  const list = [presentation("a", "Лівобережна кухня", [3361, 2048]), presentation("b", "Центр", [3361, 2043])];

  it("is case-insensitive and ignores surrounding spaces", () => {
    expect(isDuplicateName("  лівобережна КУХНЯ ", list, null)).toBe(true);
    expect(isDuplicateName("Правобережна", list, null)).toBe(false);
  });

  it("ignores the presentation being edited", () => {
    expect(isDuplicateName("Центр", list, "b")).toBe(false);
    expect(isDuplicateName("Центр", list, "a")).toBe(true);
  });
});

describe("findOverlaps", () => {
  const list = [presentation("a", "Лівобережна кухня", [2043, 2048, 3361]), presentation("b", "Центр", [2048, 3361])];

  it("reports selected filials that are already in other presentations", () => {
    expect(findOverlaps([3361, 1111], list, "a")).toEqual({ filialIds: [3361], presentationNames: ["Центр"] });
  });

  it("names every other presentation that shares a filial", () => {
    expect(findOverlaps([2043, 2048], list, null)).toEqual({
      filialIds: [2043, 2048],
      presentationNames: ["Лівобережна кухня", "Центр"]
    });
  });

  it("is empty when nothing is shared", () => {
    expect(findOverlaps([2043], list, "a")).toEqual({ filialIds: [], presentationNames: [] });
  });
});

describe("filialCountWarning", () => {
  it("warns above 4 and discourages above 6", () => {
    expect(filialCountWarning(4)).toBeNull();
    expect(filialCountWarning(5)).toContain("для 5–6 колонки звузяться");
    expect(filialCountWarning(6)).toContain("для 5–6 колонки звузяться");
    expect(filialCountWarning(7)).toMatch(/^Більше 6 філій не рекомендовано/);
  });
});

describe("formatMinuteOfDay", () => {
  it("formats minutes and marks the next day", () => {
    expect(formatMinuteOfDay(550)).toBe("09:10");
    expect(formatMinuteOfDay(0)).toBe("00:00");
    expect(formatMinuteOfDay(1340)).toBe("22:20");
    expect(formatMinuteOfDay(1440 + 550)).toBe("09:10 (+1 доба)");
  });
});

describe("buildGroupingExample", () => {
  it("needs 2 filials and a valid window", () => {
    expect(buildGroupingExample([3361], 5)).toBeNull();
    expect(buildGroupingExample([3361, 2048], null)).toBeNull();
    expect(buildGroupingExample([3361, 2048], 0.25)).toBeNull();
  });

  it("assigns the orders round-robin in selection order", () => {
    const example = buildGroupingExample([3361, 2048, 2043], 5);
    expect(example?.orders).toEqual([
      { filialId: 3361, minute: 550 },
      { filialId: 2048, minute: 605 },
      { filialId: 2043, minute: 730 },
      { filialId: 3361, minute: 1040 }
    ]);
  });

  it("groups 09:10/10:05/12:10/17:20 into 2 batches at 5 h", () => {
    const example = buildGroupingExample([3361, 2048, 2043], 5);
    expect(example?.batches).toEqual([
      { start: 550, end: 850, filialIds: [3361, 2048, 2043] },
      { start: 1040, end: 1340, filialIds: [3361] }
    ]);
  });

  it("includes an order exactly at the window end (3 h: 09:10 → 12:10)", () => {
    const example = buildGroupingExample([3361, 2048], 3);
    expect(example?.batches.map((batch) => [batch.start, batch.end])).toEqual([
      [550, 730],
      [1040, 1220]
    ]);
    expect(example?.batches[0].filialIds).toEqual([3361, 2048]);
  });

  it("splits more with a short window and merges everything with a long one", () => {
    expect(buildGroupingExample([3361, 2048], 2)?.batches.map((batch) => batch.start)).toEqual([550, 730, 1040]);
    expect(buildGroupingExample([3361, 2048], 0.5)?.batches).toHaveLength(4);
    expect(buildGroupingExample([3361, 2048], 8.5)?.batches).toEqual([
      { start: 550, end: 1060, filialIds: [3361, 2048] }
    ]);
  });
});
