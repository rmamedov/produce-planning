const SILPO_API_BASE = "https://sf-ecom-api.silpo.ua/v1/uk";

// Any valid Silpo branch works for resolving a product title (the title does
// not depend on the branch). Overridable via env if needed.
const SILPO_BRANCH_ID = process.env.SILPO_BRANCH_ID ?? "1ed43e73-051b-6842-a111-a5ad042eb496";

// In-memory cache so repeated lookups for the same SKU don't hit Silpo again.
const cache = new Map<number, string | null>();

/**
 * Resolves a lager_id (Silpo SKU) to a product name via the Silpo storefront API.
 * The SKU is accepted directly as the product slug. Returns null if not found.
 */
export async function resolveLagerName(sku: number): Promise<string | null> {
  if (cache.has(sku)) {
    return cache.get(sku) ?? null;
  }

  try {
    const response = await fetch(
      `${SILPO_API_BASE}/branches/${SILPO_BRANCH_ID}/products/${sku}`,
      {
        headers: { Accept: "application/json" },
        cache: "no-store"
      }
    );

    if (!response.ok) {
      cache.set(sku, null);
      return null;
    }

    const data = (await response.json()) as { title?: unknown };
    const name = typeof data.title === "string" && data.title.trim() ? data.title : null;
    cache.set(sku, name);
    return name;
  } catch {
    // Network/Silpo errors must never break task generation or listing.
    return null;
  }
}

/**
 * Resolves several SKUs in parallel, returning a map keyed by SKU.
 */
export async function resolveLagerNames(skus: number[]): Promise<Map<number, string | null>> {
  const unique = Array.from(new Set(skus));
  const result = new Map<number, string | null>();

  await Promise.all(
    unique.map(async (sku) => {
      result.set(sku, await resolveLagerName(sku));
    })
  );

  return result;
}
