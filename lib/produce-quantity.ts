/**
 * Rounds the recommended production quantity to a producible amount.
 *
 * Unit-aware:
 *  - "шт" (pieces): round to the nearest whole piece, minimum 1.
 *  - "кг" (weight, the default): multiple of 0.5 kg, minimum 0.5 kg.
 *
 * Weight rules:
 *  - result is always a multiple of 0.5 kg;
 *  - forecast < 0.5 kg → minimum 0.5 kg;
 *  - fractional part in [0.5, 0.74] → round to the .5 step;
 *  - fractional part in [0.75, 1.0) → round up to the next whole kg.
 * (i.e. "round to nearest 0.5", half rounds up, with a 0.5 floor.)
 */
export function roundProduceQuantity(value: number, unit?: string | null): number {
  if (value <= 0) {
    return 0;
  }

  if (unit === "шт") {
    return Math.max(1, Math.round(value));
  }

  if (value < 0.5) {
    return 0.5;
  }
  return Math.round(value * 2) / 2;
}
