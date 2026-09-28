import { describe, expect, it } from "vitest";

import { productionTaskDocumentSchema } from "@/api/schemas";
import {
  documentQuantity,
  documentTotals,
  generateTransferId,
  isDocumentable,
  pruneDeselected
} from "@/lib/task-documenting";

describe("isDocumentable", () => {
  it("accepts only DONE tasks not yet documented", () => {
    expect(isDocumentable({ status: "DONE", documented_at: null })).toBe(true);
    expect(isDocumentable({ status: "DONE" })).toBe(true);
    expect(isDocumentable({ status: "DONE", documented_at: "2026-09-28T12:00:00Z" })).toBe(false);
    expect(isDocumentable({ status: "IN_PROGRESS", documented_at: null })).toBe(false);
    expect(isDocumentable({ status: "NEW" })).toBe(false);
  });
});

describe("documentQuantity", () => {
  it("uses the reported produced quantity and falls back to the order", () => {
    expect(documentQuantity({ produced_qty: 26, quantity: 20 })).toBe(26);
    expect(documentQuantity({ produced_qty: null, quantity: 20 })).toBe(20);
    expect(documentQuantity({ quantity: 20 })).toBe(20);
  });
});

describe("documentTotals", () => {
  it("sums pieces and kilograms separately, never mixing units", () => {
    const totals = documentTotals([
      { unit: "шт", produced_qty: 24, quantity: 24 },
      { unit: "шт", produced_qty: null, quantity: 8 },
      { unit: "кг", produced_qty: 2.5, quantity: 3 },
      { unit: "кг", produced_qty: 2.5, quantity: 2.5 }
    ]);
    expect(totals).toEqual({ count: 4, pcs: 32, kg: 5 });
  });

  it("treats an unknown unit as pieces and handles the empty list", () => {
    expect(documentTotals([{ unit: null, quantity: 3 }]).pcs).toBe(3);
    expect(documentTotals([])).toEqual({ count: 0, pcs: 0, kg: 0 });
  });

  it("keeps kilogram sums to two decimals", () => {
    const totals = documentTotals([
      { unit: "кг", produced_qty: 0.1, quantity: 1 },
      { unit: "кг", produced_qty: 0.2, quantity: 1 }
    ]);
    expect(totals.kg).toBe(0.3);
  });
});

describe("pruneDeselected", () => {
  it("drops ids that are no longer on the tab and keeps the rest", () => {
    const pruned = pruneDeselected(new Set(["a", "b", "gone"]), ["a", "b", "c"]);
    expect([...pruned].sort()).toEqual(["a", "b"]);
  });

  it("new tasks are not in the set — i.e. they arrive checked", () => {
    const pruned = pruneDeselected(new Set(), ["new-task"]);
    expect(pruned.has("new-task")).toBe(false);
  });
});

describe("generateTransferId", () => {
  it("is readable and unique-ish: RBK-YYYYMMDD-XXXXXX", () => {
    const id = generateTransferId(new Date("2026-09-28T10:00:00Z"), () => 0.5);
    expect(id).toMatch(/^RBK-20260928-[0-9A-Z]{6}$/);
  });

  it("different randomness gives different suffixes", () => {
    const a = generateTransferId(new Date(), () => 0.1);
    const b = generateTransferId(new Date(), () => 0.9);
    expect(a).not.toBe(b);
  });
});

describe("document endpoint schema", () => {
  it("requires at least one task id and caps the batch", () => {
    expect(productionTaskDocumentSchema.parse({ task_ids: ["t1"] }).task_ids).toEqual(["t1"]);
    expect(productionTaskDocumentSchema.safeParse({ task_ids: [] }).success).toBe(false);
    expect(
      productionTaskDocumentSchema.safeParse({ task_ids: Array(501).fill("x") }).success
    ).toBe(false);
  });
});
