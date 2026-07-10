// Small async utilities used on the ingest hot path. Unit-tested in
// tests/concurrency.test.ts.

/**
 * Maps `items` through an async `fn` with at most `limit` calls in flight.
 * Results keep the input order. An empty input resolves to [].
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  const workerCount = Math.max(1, Math.min(limit, items.length));
  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const index = next++;
      if (index >= items.length) break;
      results[index] = await fn(items[index], index);
    }
  });

  await Promise.all(workers);
  return results;
}

/** Splits an array into chunks of at most `size` items (size >= 1). */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  const step = Math.max(1, Math.floor(size));
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += step) {
    chunks.push(items.slice(i, i + step));
  }
  return chunks;
}
