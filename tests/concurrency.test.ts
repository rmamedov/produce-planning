import { describe, expect, it } from "vitest";

import { chunk, mapWithConcurrency } from "@/lib/concurrency";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("mapWithConcurrency", () => {
  it("returns results in input order", async () => {
    const items = [30, 10, 20, 5];
    const results = await mapWithConcurrency(items, 2, async (ms) => {
      await wait(ms);
      return ms * 2;
    });
    expect(results).toEqual([60, 20, 40, 10]);
  });

  it("never exceeds the concurrency limit", async () => {
    let active = 0;
    let peak = 0;
    await mapWithConcurrency(Array.from({ length: 20 }, (_, i) => i), 3, async () => {
      active += 1;
      peak = Math.max(peak, active);
      await wait(5);
      active -= 1;
    });
    expect(peak).toBeLessThanOrEqual(3);
    expect(peak).toBeGreaterThan(1); // did actually run in parallel
  });

  it("handles an empty input and a limit larger than the input", async () => {
    expect(await mapWithConcurrency([], 8, async () => 1)).toEqual([]);
    expect(await mapWithConcurrency([1, 2], 100, async (n) => n + 1)).toEqual([2, 3]);
  });

  it("passes the index to the mapper", async () => {
    const results = await mapWithConcurrency(["a", "b"], 1, async (item, index) => `${item}${index}`);
    expect(results).toEqual(["a0", "b1"]);
  });
});

describe("chunk", () => {
  it("splits into batches of at most `size`", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("returns a single batch when size >= length, and [] for empty input", () => {
    expect(chunk([1, 2], 10)).toEqual([[1, 2]]);
    expect(chunk([], 10)).toEqual([]);
  });

  it("guards against a non-positive size", () => {
    expect(chunk([1, 2, 3], 0)).toEqual([[1], [2], [3]]);
  });
});
