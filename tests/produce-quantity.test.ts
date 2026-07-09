import { describe, expect, it } from "vitest";

import { roundProduceQuantity } from "@/lib/produce-quantity";

describe("roundProduceQuantity (кг)", () => {
  it("returns 0 for non-positive forecasts", () => {
    expect(roundProduceQuantity(0)).toBe(0);
    expect(roundProduceQuantity(-1)).toBe(0);
  });

  it("asks for at least 0.5 kg", () => {
    expect(roundProduceQuantity(0.018)).toBe(0.5);
    expect(roundProduceQuantity(0.49)).toBe(0.5);
  });

  it("rounds fractional [0.5, 0.74] down to the .5 step", () => {
    expect(roundProduceQuantity(0.5)).toBe(0.5);
    expect(roundProduceQuantity(0.74)).toBe(0.5);
    expect(roundProduceQuantity(1.6)).toBe(1.5);
  });

  it("rounds fractional [0.75, 1.0) up to the next whole kg", () => {
    expect(roundProduceQuantity(0.75)).toBe(1);
    expect(roundProduceQuantity(0.99)).toBe(1);
    expect(roundProduceQuantity(1.8)).toBe(2);
  });

  it("keeps values already on the 0.5 grid", () => {
    expect(roundProduceQuantity(2)).toBe(2);
    expect(roundProduceQuantity(2.5)).toBe(2.5);
  });
});

describe("roundProduceQuantity (шт)", () => {
  it("rounds pieces to whole units with a minimum of 1", () => {
    expect(roundProduceQuantity(0.2, "шт")).toBe(1);
    expect(roundProduceQuantity(1.4, "шт")).toBe(1);
    expect(roundProduceQuantity(1.5, "шт")).toBe(2);
    expect(roundProduceQuantity(10, "шт")).toBe(10);
  });

  it("returns 0 for non-positive piece forecasts", () => {
    expect(roundProduceQuantity(0, "шт")).toBe(0);
  });
});
