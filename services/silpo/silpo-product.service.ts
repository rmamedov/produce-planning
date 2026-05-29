const SILPO_API_BASE = "https://sf-ecom-api.silpo.ua/v1/uk";

// Any valid Silpo branch works for resolving product info (it does not depend
// on the branch). Overridable via env if needed.
const SILPO_BRANCH_ID = process.env.SILPO_BRANCH_ID ?? "1ed43e73-051b-6842-a111-a5ad042eb496";

export interface LagerInfo {
  name: string | null;
  unit: string | null; // unit of measure ("шт" / "кг") from Silpo `ratio`
}

// In-memory cache so repeated lookups for the same SKU don't hit Silpo again.
const cache = new Map<number, LagerInfo>();

/**
 * Resolves a lager_id (Silpo SKU) to its product name and unit of measure via
 * the Silpo storefront API. The SKU is accepted directly as the product slug.
 */
export async function resolveLagerInfo(sku: number): Promise<LagerInfo> {
  const cached = cache.get(sku);
  if (cached) {
    return cached;
  }

  const empty: LagerInfo = { name: null, unit: null };

  try {
    const response = await fetch(
      `${SILPO_API_BASE}/branches/${SILPO_BRANCH_ID}/products/${sku}`,
      {
        headers: { Accept: "application/json" },
        cache: "no-store"
      }
    );

    if (!response.ok) {
      cache.set(sku, empty);
      return empty;
    }

    const data = (await response.json()) as { title?: unknown; ratio?: unknown };
    const name = typeof data.title === "string" && data.title.trim() ? data.title : null;
    const unit = typeof data.ratio === "string" && data.ratio.trim() ? data.ratio.trim() : null;
    const info: LagerInfo = { name, unit };
    cache.set(sku, info);
    return info;
  } catch {
    // Network/Silpo errors must never break task generation or listing.
    return empty;
  }
}

/** Convenience: resolve just the product name. */
export async function resolveLagerName(sku: number): Promise<string | null> {
  return (await resolveLagerInfo(sku)).name;
}

/**
 * Resolves several SKUs in parallel, returning a map of SKU -> LagerInfo.
 */
export async function resolveLagerInfos(skus: number[]): Promise<Map<number, LagerInfo>> {
  const unique = Array.from(new Set(skus));
  const result = new Map<number, LagerInfo>();

  await Promise.all(
    unique.map(async (sku) => {
      result.set(sku, await resolveLagerInfo(sku));
    })
  );

  return result;
}
