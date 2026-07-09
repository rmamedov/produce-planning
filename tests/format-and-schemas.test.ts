import { describe, expect, it } from "vitest";

import { productionTaskQuerySchema } from "@/api/schemas";
import { formatCoverage, formatCoverageParts } from "@/lib/format";

describe("formatCoverageParts / formatCoverage", () => {
  it("shows sub-hour coverage in whole minutes", () => {
    expect(formatCoverageParts(0.3)).toEqual({ value: "18", unit: "хв" });
    expect(formatCoverageParts(0.75)).toEqual({ value: "45", unit: "хв" });
    expect(formatCoverage(0.5)).toBe("30 хв");
  });

  it("shows coverage of an hour or more in hours, 1 decimal", () => {
    expect(formatCoverageParts(2.4)).toEqual({ value: "2.4", unit: "год" });
    expect(formatCoverageParts(4.17)).toEqual({ value: "4.2", unit: "год" });
    expect(formatCoverage(5)).toBe("5 год");
  });
});

describe("productionTaskQuerySchema status", () => {
  it("accepts a single status", () => {
    expect(productionTaskQuerySchema.parse({ status: "NEW" }).status).toBe("NEW");
  });

  it("accepts a comma-separated status list (used by the kitchen board)", () => {
    expect(productionTaskQuerySchema.parse({ status: "NEW,IN_PROGRESS" }).status).toBe(
      "NEW,IN_PROGRESS"
    );
  });

  it("rejects unknown statuses", () => {
    expect(() => productionTaskQuerySchema.parse({ status: "BOGUS" })).toThrow();
    expect(() => productionTaskQuerySchema.parse({ status: "NEW,BOGUS" })).toThrow();
  });

  it("keeps status optional", () => {
    expect(productionTaskQuerySchema.parse({}).status).toBeUndefined();
  });
});
