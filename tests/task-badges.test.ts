import { describe, expect, it } from "vitest";

import { productionPlanPriorityItemSchema } from "@/api/schemas";
import {
  BAKERY_TYPES,
  ecomOrdersLabel,
  hasPromo,
  matchesBakeryType,
  promoMechanicsList,
  resolveBakeryTypeSelection
} from "@/lib/task-badges";

describe("promoMechanicsList / hasPromo", () => {
  it("splits mechanics by slash and trims them", () => {
    expect(promoMechanicsList("знижка/кешбек")).toEqual(["знижка", "кешбек"]);
    expect(promoMechanicsList(" знижка / кешбек ")).toEqual(["знижка", "кешбек"]);
    expect(promoMechanicsList("знижка")).toEqual(["знижка"]);
  });

  it("empty or missing value means no promo — and no badge", () => {
    expect(promoMechanicsList("")).toEqual([]);
    expect(promoMechanicsList(null)).toEqual([]);
    expect(promoMechanicsList(undefined)).toEqual([]);
    expect(promoMechanicsList("//")).toEqual([]);
    expect(hasPromo("знижка/кешбек")).toBe(true);
    expect(hasPromo("")).toBe(false);
    expect(hasPromo(null)).toBe(false);
  });
});

describe("ecomOrdersLabel", () => {
  it("formats positive counts per spec", () => {
    expect(ecomOrdersLabel(14)).toBe("e-com замовлень — 14");
    expect(ecomOrdersLabel(1)).toBe("e-com замовлень — 1");
  });

  it("hides zero and missing values (П2)", () => {
    expect(ecomOrdersLabel(0)).toBeNull();
    expect(ecomOrdersLabel(null)).toBeNull();
    expect(ecomOrdersLabel(undefined)).toBeNull();
  });
});

describe("matchesBakeryType", () => {
  it("'all' passes every task, typed values must match exactly", () => {
    expect(matchesBakeryType("Пекарня", "all")).toBe(true);
    expect(matchesBakeryType(null, "all")).toBe(true);
    expect(matchesBakeryType("Пекарня", "Пекарня")).toBe(true);
    expect(matchesBakeryType("Допікання", "Пекарня")).toBe(false);
  });

  it("tasks without a type are visible only in 'all'", () => {
    expect(matchesBakeryType(null, "Пекарня")).toBe(false);
    expect(matchesBakeryType(undefined, "Кондитерська")).toBe(false);
  });
});

describe("resolveBakeryTypeSelection", () => {
  it("restores a known type and falls back to 'all' for anything else", () => {
    for (const type of BAKERY_TYPES) {
      expect(resolveBakeryTypeSelection(type)).toBe(type);
    }
    expect(resolveBakeryTypeSelection(null)).toBe("all");
    expect(resolveBakeryTypeSelection("подова")).toBe("all");
    expect(resolveBakeryTypeSelection("")).toBe("all");
  });
});

describe("ingest schema — V2.1 fields", () => {
  const baseItem = {
    lager_id: 746131,
    priority: 1,
    covered_hours: 1.5,
    current_stock_qty: 4,
    demand_till_day_end: 30,
    demand_whole_day: 46,
    recommended_to_produce: 26,
    demand_before_qty: 0
  };

  it("accepts a V2 payload without the new fields (backward compatibility)", () => {
    expect(productionPlanPriorityItemSchema.parse(baseItem)).toBeTruthy();
  });

  it("accepts all four new fields", () => {
    const parsed = productionPlanPriorityItemSchema.parse({
      ...baseItem,
      is_guest_promise: true,
      promo_mechanics: "знижка/кешбек",
      ecom_orders_qty: 14,
      bakery_type: "Пекарня"
    });
    expect(parsed.bakery_type).toBe("Пекарня");
    expect(parsed.ecom_orders_qty).toBe(14);
  });

  it("rejects an unknown bakery_type with a Ukrainian message", () => {
    const result = productionPlanPriorityItemSchema.safeParse({
      ...baseItem,
      bakery_type: "подова"
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("Пекарня");
    }
  });

  it("rejects a negative or fractional ecom_orders_qty", () => {
    expect(
      productionPlanPriorityItemSchema.safeParse({ ...baseItem, ecom_orders_qty: -1 }).success
    ).toBe(false);
    expect(
      productionPlanPriorityItemSchema.safeParse({ ...baseItem, ecom_orders_qty: 1.5 }).success
    ).toBe(false);
    expect(
      productionPlanPriorityItemSchema.safeParse({ ...baseItem, ecom_orders_qty: null }).success
    ).toBe(true);
  });
});
