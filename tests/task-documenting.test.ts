import { describe, expect, it } from "vitest";

import { productionTaskDocumentSchema } from "@/api/schemas";
import { ApiError } from "@/lib/api-error";
import {
  documentFailureInfo,
  documentQuantity,
  documentTotals,
  isDocumentable,
  pruneDeselected,
  stopsDocumentRun,
  transferToastMessage
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

describe("transferToastMessage", () => {
  const id = "3fa85f64-5717-4562-b3fc-2c963f66afa6";

  it("names a single transfer by the first 8 characters of its orderId", () => {
    expect(transferToastMessage([id], true)).toBe("Трансфер сформовано в Рубіконі · №3fa85f64");
  });

  it("counts several transfers with the right plural", () => {
    expect(transferToastMessage([id, id], true)).toBe("Сформовано 2 трансфери у Рубіконі");
    expect(transferToastMessage(Array(5).fill(id), true)).toBe("Сформовано 5 трансферів у Рубіконі");
  });

  it("flags stub mode", () => {
    expect(transferToastMessage([id], false)).toBe(
      "Трансфер сформовано в Рубіконі · №3fa85f64 (тестовий режим, без відправки)"
    );
  });

  it("is null when nothing was documented", () => {
    expect(transferToastMessage([], true)).toBeNull();
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

  it("takes an optional presentation id", () => {
    expect(productionTaskDocumentSchema.parse({ task_ids: ["t1"], presentation_id: "p1" }).presentation_id).toBe("p1");
    expect(productionTaskDocumentSchema.parse({ task_ids: ["t1"], presentation_id: null }).presentation_id).toBeNull();
    expect(productionTaskDocumentSchema.safeParse({ task_ids: ["t1"], presentation_id: "" }).success).toBe(false);
  });
});

describe("documentFailureInfo", () => {
  it("keeps the transfers created before a later date group failed", () => {
    const error = new ApiError("Рубікон недоступний", 502, {
      message: "Рубікон недоступний",
      code: "unreachable",
      transfer_ids: ["3fa85f64-5717-4562-b3fc-2c963f66afa6"],
      documented: 3,
      delivered: true
    });
    expect(documentFailureInfo(error)).toEqual({
      message: "Рубікон недоступний",
      code: "unreachable",
      transferIds: ["3fa85f64-5717-4562-b3fc-2c963f66afa6"],
      delivered: true
    });
  });

  it("reads an error without a body (offline, older server) as nothing created", () => {
    expect(documentFailureInfo(new TypeError("Failed to fetch"))).toEqual({
      message: "Failed to fetch",
      code: null,
      transferIds: [],
      delivered: false
    });
    expect(documentFailureInfo(new ApiError("x", 500, { transfer_ids: "nope", code: 7 }))).toMatchObject({
      code: null,
      transferIds: []
    });
    expect(documentFailureInfo("boom").message).toBe("Не вдалося сформувати документ");
  });
});

describe("stopsDocumentRun", () => {
  it("stops «Оформити всі» on failures every filial would hit", () => {
    expect(["unreachable", "auth", "config"].every(stopsDocumentRun)).toBe(true);
  });

  it("goes on after a failure of one document", () => {
    expect(["rejected", "conflict", null].some(stopsDocumentRun)).toBe(false);
  });
});
