import { describe, expect, it } from "vitest";

import {
  DATE_QUICK_OPTIONS,
  DEFAULT_DEPARTMENT_ID,
  DEFAULT_FILIAL_ID,
  dateFilterLabel,
  isConcreteDate,
  isPresentationScope,
  isoDateOffset,
  localDateStr,
  presentationIdOf,
  presentationScopeValue,
  resolveBranchSelection,
  resolveDateFilter,
  resolveDepartmentSelection,
  resolveScopeSelection
} from "@/lib/kitchen-filters";

// Fixed reference date: 15 July 2026 (local time).
const NOW = new Date(2026, 6, 15, 12, 30);

describe("isoDateOffset / localDateStr", () => {
  it("formats local dates as YYYY-MM-DD", () => {
    expect(localDateStr(NOW)).toBe("2026-07-15");
  });

  it("applies day offsets", () => {
    expect(isoDateOffset(0, NOW)).toBe("2026-07-15");
    expect(isoDateOffset(-1, NOW)).toBe("2026-07-14");
    expect(isoDateOffset(1, NOW)).toBe("2026-07-16");
    expect(isoDateOffset(2, NOW)).toBe("2026-07-17");
  });

  it("crosses month boundaries", () => {
    expect(isoDateOffset(1, new Date(2026, 0, 31))).toBe("2026-02-01");
    expect(isoDateOffset(-1, new Date(2026, 2, 1))).toBe("2026-02-28");
  });

  it("crosses year boundaries", () => {
    expect(isoDateOffset(1, new Date(2026, 11, 31))).toBe("2027-01-01");
    expect(isoDateOffset(-1, new Date(2026, 0, 1))).toBe("2025-12-31");
  });
});

describe("resolveDateFilter", () => {
  it("resolves semantic tokens against 'now'", () => {
    expect(resolveDateFilter("yesterday", NOW)).toBe("2026-07-14");
    expect(resolveDateFilter("today", NOW)).toBe("2026-07-15");
    expect(resolveDateFilter("tomorrow", NOW)).toBe("2026-07-16");
    expect(resolveDateFilter("aftertomorrow", NOW)).toBe("2026-07-17");
  });

  it("passes concrete dates through", () => {
    expect(resolveDateFilter("2026-01-02", NOW)).toBe("2026-01-02");
  });

  it("returns 'all' for 'all' and unknown values", () => {
    expect(resolveDateFilter("all", NOW)).toBe("all");
    expect(resolveDateFilter("garbage", NOW)).toBe("all");
    expect(resolveDateFilter("", NOW)).toBe("all");
  });
});

describe("dateFilterLabel", () => {
  it("labels quick options in Ukrainian", () => {
    expect(dateFilterLabel("all")).toBe("Усі дати");
    expect(dateFilterLabel("yesterday")).toBe("Вчора");
    expect(dateFilterLabel("today")).toBe("Сьогодні");
    expect(dateFilterLabel("tomorrow")).toBe("Завтра");
    expect(dateFilterLabel("aftertomorrow")).toBe("Післязавтра");
  });

  it("formats concrete dates as dd.mm.yyyy", () => {
    expect(dateFilterLabel("2026-07-04")).toBe("04.07.2026");
  });

  it("includes Вчора in the quick options", () => {
    expect(DATE_QUICK_OPTIONS.map((o) => o.value)).toContain("yesterday");
  });
});

describe("resolveBranchSelection", () => {
  it("keeps the stored concrete choice, even before options load", () => {
    expect(resolveBranchSelection("2048", [], false)).toBe("2048");
    expect(resolveBranchSelection("2048", [3361, 2043], true)).toBe("2048");
  });

  it("ignores the legacy 'all' value", () => {
    expect(resolveBranchSelection("all", [3361, 2048], true)).toBe(String(DEFAULT_FILIAL_ID));
  });

  it("waits for options when there is no stored choice", () => {
    expect(resolveBranchSelection(null, [], false)).toBeNull();
  });

  it("prefers the default filial (3361) when available", () => {
    expect(resolveBranchSelection(null, [2048, 3361, 2043], true)).toBe("3361");
  });

  it("falls back to the first available filial when 3361 is absent", () => {
    expect(resolveBranchSelection(null, [2048, 2043], true)).toBe("2043");
  });

  it("falls back to the default when nothing is available", () => {
    expect(resolveBranchSelection(null, [], true)).toBe(String(DEFAULT_FILIAL_ID));
  });

  it("ignores garbage stored values", () => {
    expect(resolveBranchSelection("abc", [2048], true)).toBe("2048");
  });
});

describe("presentation scope values", () => {
  it("round-trips a presentation id through the stored value", () => {
    expect(presentationScopeValue("abc")).toBe("p:abc");
    expect(isPresentationScope("p:abc")).toBe(true);
    expect(presentationIdOf("p:abc")).toBe("abc");
  });

  it("does not treat filial ids, empty or missing values as presentations", () => {
    expect(isPresentationScope("3361")).toBe(false);
    expect(isPresentationScope(null)).toBe(false);
    expect(isPresentationScope(undefined)).toBe(false);
    expect(presentationIdOf("3361")).toBeNull();
    expect(presentationIdOf("p:")).toBeNull();
  });
});

describe("resolveScopeSelection", () => {
  it("keeps a stored presentation that still exists", () => {
    expect(resolveScopeSelection("p:left", [3361, 2048], ["left", "center"], true)).toBe("p:left");
  });

  it("keeps a stored presentation while presentations are not loaded yet", () => {
    expect(resolveScopeSelection("p:left", [], [], false)).toBe("p:left");
    expect(resolveScopeSelection("p:gone", [2048], [], false)).toBe("p:gone");
  });

  it("falls back to the default filial when the presentation was deleted", () => {
    expect(resolveScopeSelection("p:gone", [2048, 3361], ["left"], true)).toBe("3361");
  });

  it("falls back to the first available filial when 3361 has no tasks", () => {
    expect(resolveScopeSelection("p:gone", [2048, 2043], ["left"], true)).toBe("2043");
  });

  it("falls back to the default filial when nothing is available", () => {
    expect(resolveScopeSelection("p:gone", [], [], true)).toBe(String(DEFAULT_FILIAL_ID));
  });

  it("treats an empty presentation id as garbage", () => {
    expect(resolveScopeSelection("p:", [2048], ["left"], true)).toBe("2048");
    expect(resolveScopeSelection("p:", [2048], ["left"], false)).toBeNull();
  });

  it("keeps a stored filial exactly like resolveBranchSelection", () => {
    expect(resolveScopeSelection("2048", [], [], false)).toBe("2048");
    expect(resolveScopeSelection("2048", [3361], ["left"], true)).toBe("2048");
  });

  it("uses the default filial logic without a stored choice", () => {
    expect(resolveScopeSelection(null, [], [], false)).toBeNull();
    expect(resolveScopeSelection(null, [2048, 3361], ["left"], true)).toBe("3361");
    expect(resolveScopeSelection("all", [2048], [], true)).toBe("2048");
    expect(resolveScopeSelection("abc", [2043], [], true)).toBe("2043");
  });
});

describe("resolveDepartmentSelection", () => {
  it("defaults to Пекарня (17)", () => {
    expect(resolveDepartmentSelection(null)).toBe(String(DEFAULT_DEPARTMENT_ID));
    expect(DEFAULT_DEPARTMENT_ID).toBe(17);
  });

  it("keeps the stored choice, including 'all'", () => {
    expect(resolveDepartmentSelection("13")).toBe("13");
    expect(resolveDepartmentSelection("all")).toBe("all");
  });
});

describe("isConcreteDate", () => {
  it("accepts YYYY-MM-DD only", () => {
    expect(isConcreteDate("2026-07-15")).toBe(true);
    expect(isConcreteDate("today")).toBe(false);
    expect(isConcreteDate("all")).toBe(false);
    expect(isConcreteDate("15.07.2026")).toBe(false);
  });
});
