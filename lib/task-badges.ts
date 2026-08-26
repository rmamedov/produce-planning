// Pure logic for the V2.1 article attributes (promo, guest promise, e-com
// orders, bakery type) shown on the kitchen board. Unit-tested in
// tests/task-badges.test.ts; also the single source of truth for the
// bakery_type enum used by the ingest schema.

export const BAKERY_TYPES = ["Пекарня", "Допікання", "Кондитерська"] as const;
export type BakeryType = (typeof BAKERY_TYPES)[number];

/**
 * Splits promo_mechanics ("знижка/кешбек") into individual mechanics.
 * An empty/missing value means no promo — and no badge.
 */
export function promoMechanicsList(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);
}

/** The «Промо» badge shows only when at least one mechanic is present. */
export function hasPromo(value: string | null | undefined): boolean {
  return promoMechanicsList(value).length > 0;
}

/**
 * Card line "e-com замовлень — X". Shown only for values > 0 (П2: zero and
 * missing values would just add noise to the cards).
 */
export function ecomOrdersLabel(qty: number | null | undefined): string | null {
  if (qty == null || qty <= 0) return null;
  return `e-com замовлень — ${qty}`;
}

/** Bakery-type filter: "all" passes everything; a concrete type must match. */
export function matchesBakeryType(
  taskType: string | null | undefined,
  selected: string
): boolean {
  if (selected === "all") return true;
  return taskType === selected;
}

/**
 * Restores the persisted filter value: a known type wins, anything else
 * (legacy/garbage) falls back to "all".
 */
export function resolveBakeryTypeSelection(stored: string | null): string {
  if (stored && (BAKERY_TYPES as readonly string[]).includes(stored)) return stored;
  return "all";
}
