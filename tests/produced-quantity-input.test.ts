import { describe, expect, it } from "vitest";

import { productionTaskCompleteSchema } from "@/api/schemas";
import {
  allowsDecimal,
  appendComma,
  appendDigit,
  backspaceValue,
  canConfirmQuantity,
  clearValue,
  formatQuantity,
  parseQuantity,
  quantityHint,
  quantityStep,
  stepValue
} from "@/lib/produced-quantity-input";

describe("clear / backspace — no NaN, ever", () => {
  it("С always lands on exactly '0' (the mock's NaN bug)", () => {
    expect(clearValue()).toBe("0");
    expect(parseQuantity(clearValue())).toBe(0);
  });

  it("backspacing the last character lands on '0', not ''", () => {
    expect(backspaceValue("7")).toBe("0");
    expect(backspaceValue("0")).toBe("0");
    expect(backspaceValue("26")).toBe("2");
    expect(backspaceValue("1,5")).toBe("1,");
  });

  it("parseQuantity never returns NaN", () => {
    for (const value of ["", ",", "3,", "abc", "1,5"]) {
      expect(Number.isNaN(parseQuantity(value))).toBe(false);
    }
    expect(parseQuantity("1,5")).toBe(1.5);
    expect(parseQuantity("3,")).toBe(3);
  });
});

describe("digits", () => {
  it("replaces a lone zero and appends otherwise", () => {
    expect(appendDigit("0", "5", "шт")).toBe("5");
    expect(appendDigit("2", "6", "шт")).toBe("26");
  });

  it("caps the integer part at 4 digits", () => {
    expect(appendDigit("9999", "1", "шт")).toBe("9999");
  });

  it("ignores non-digits", () => {
    expect(appendDigit("26", "С", "шт")).toBe("26");
    expect(appendDigit("26", ",", "шт")).toBe("26");
  });

  it("кг: allows exactly one decimal digit after the comma", () => {
    expect(appendDigit("1,", "5", "кг")).toBe("1,5");
    expect(appendDigit("1,5", "7", "кг")).toBe("1,5");
  });
});

describe("comma (кг only)", () => {
  it("adds a single comma for кг and never for шт", () => {
    expect(appendComma("12", "кг")).toBe("12,");
    expect(appendComma("12,", "кг")).toBe("12,");
    expect(appendComma("12", "шт")).toBe("12");
    expect(allowsDecimal("кг")).toBe(true);
    expect(allowsDecimal("шт")).toBe(false);
  });
});

describe("steppers", () => {
  it("шт: ±1, integers, clamped at 0", () => {
    expect(quantityStep("шт")).toBe(1);
    expect(stepValue("26", 1, "шт")).toBe("27");
    expect(stepValue("1", -1, "шт")).toBe("0");
    expect(stepValue("0", -1, "шт")).toBe("0");
  });

  it("кг: ±0,5 with comma formatting", () => {
    expect(quantityStep("кг")).toBe(0.5);
    expect(stepValue("1", 1, "кг")).toBe("1,5");
    expect(stepValue("0,5", -1, "кг")).toBe("0");
    expect(stepValue("3,", 1, "кг")).toBe("3,5");
  });

  it("the card's default unit (кг when null) keeps comma formatting", () => {
    expect(formatQuantity(2.5)).toBe("2,5");
    expect(stepValue("2", 1, "кг")).toBe("2,5");
  });
});

describe("confirm gating and hints", () => {
  it("confirm only for a positive quantity", () => {
    expect(canConfirmQuantity("0")).toBe(false);
    expect(canConfirmQuantity("0,")).toBe(false);
    expect(canConfirmQuantity("0,5")).toBe(true);
    expect(canConfirmQuantity("26")).toBe(true);
  });

  it("hint: zero / differs / match", () => {
    expect(quantityHint("0", 26)).toBe("zero");
    expect(quantityHint("25", 26)).toBe("differs");
    expect(quantityHint("26", 26)).toBe("match");
    expect(quantityHint("1,5", 1.5)).toBe("match");
  });
});

describe("complete endpoint schema", () => {
  it("accepts a positive produced_qty, an empty body and null", () => {
    expect(productionTaskCompleteSchema.parse({ produced_qty: 26 }).produced_qty).toBe(26);
    expect(productionTaskCompleteSchema.parse({})).toEqual({});
    expect(productionTaskCompleteSchema.parse({ produced_qty: null }).produced_qty).toBeNull();
  });

  it("rejects zero and negative values", () => {
    expect(productionTaskCompleteSchema.safeParse({ produced_qty: 0 }).success).toBe(false);
    expect(productionTaskCompleteSchema.safeParse({ produced_qty: -2 }).success).toBe(false);
  });
});
