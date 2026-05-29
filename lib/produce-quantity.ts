/**
 * Rounds the recommended production quantity (kg) to a multiple of 0.5 kg.
 *
 * Rules:
 *  - result is always a multiple of 0.5 kg;
 *  - forecast < 0.5 kg → minimum 0.5 kg;
 *  - fractional part in [0.5, 0.74] → round to the .5 step;
 *  - fractional part in [0.75, 1.0) → round up to the next whole kg.
 *
 * This is "round to nearest 0.5" (half rounds up), with a 0.5 floor.
 */
export function roundProduceQuantity(value: number): number {
  if (value <= 0) {
    return 0;
  }
  if (value < 0.5) {
    return 0.5;
  }
  return Math.round(value * 2) / 2;
}
