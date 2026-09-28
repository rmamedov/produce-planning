// Pure logic of the "скільки виготовлено?" numeric input on the kitchen
// board. The value is a STRING ("12", "1,5", "3,") so intermediate states
// while typing kilograms stay representable; every transition goes through
// these functions and is unit-tested in tests/produced-quantity-input.test.ts.

const MAX_INT_DIGITS = 4; // 9999 max

/** Stepper increment: kilograms move by 0.5, pieces by 1. */
export function quantityStep(unit: string | null | undefined): number {
  return unit === "кг" ? 0.5 : 1;
}

/** Kilograms may carry one decimal (comma); pieces are integers. */
export function allowsDecimal(unit: string | null | undefined): boolean {
  return unit === "кг";
}

/** "1,5" -> 1.5; "3," -> 3; garbage -> 0 (never NaN). */
export function parseQuantity(value: string): number {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

/** 1.5 -> "1,5"; 3 -> "3". */
export function formatQuantity(quantity: number): string {
  const clamped = Math.max(0, Math.min(9999, Math.round(quantity * 10) / 10));
  return String(clamped).replace(".", ",");
}

/** Numpad digit. A lone "0" is replaced, decimals capped at one digit. */
export function appendDigit(
  value: string,
  digit: string,
  unit: string | null | undefined
): string {
  if (!/^[0-9]$/.test(digit)) return value;
  if (value.includes(",")) {
    if (!allowsDecimal(unit)) return value;
    // one decimal digit max
    return /,\d$/.test(value) ? value : value + digit;
  }
  if (value === "0") return digit;
  if (value.length >= MAX_INT_DIGITS) return value;
  return value + digit;
}

/** Comma key (kilograms only, single comma). */
export function appendComma(value: string, unit: string | null | undefined): string {
  if (!allowsDecimal(unit) || value.includes(",")) return value;
  return value + ",";
}

/** Backspace. Emptying the field lands on "0", never on "" or NaN. */
export function backspaceValue(value: string): string {
  const next = value.slice(0, -1);
  return next === "" ? "0" : next;
}

/** Clear key: always exactly "0". */
export function clearValue(): string {
  return "0";
}

/** −/+ steppers: parse whatever is typed, move by the unit step, clamp ≥0. */
export function stepValue(
  value: string,
  direction: 1 | -1,
  unit: string | null | undefined
): string {
  const stepped = parseQuantity(value) + direction * quantityStep(unit);
  const rounded = allowsDecimal(unit) ? stepped : Math.round(stepped);
  return formatQuantity(rounded);
}

/** The confirm button is enabled only for a positive quantity. */
export function canConfirmQuantity(value: string): boolean {
  return parseQuantity(value) > 0;
}

export type QuantityHint = "zero" | "differs" | "match";

/** Drives the helper text under the value. */
export function quantityHint(value: string, orderedQuantity: number): QuantityHint {
  const produced = parseQuantity(value);
  if (produced <= 0) return "zero";
  return produced === orderedQuantity ? "match" : "differs";
}
