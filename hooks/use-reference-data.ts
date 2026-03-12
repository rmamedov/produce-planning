"use client";

import { useApiQuery } from "@/hooks/use-api";
import type { BranchDto, ProductDto, TechCardDto } from "@/types";

export function useReferenceData() {
  const branches = useApiQuery<BranchDto[]>(["branches"], "/api/branches");
  const products = useApiQuery<ProductDto[]>(["products"], "/api/products");
  const techCards = useApiQuery<TechCardDto[]>(["tech-cards"], "/api/tech-cards");

  return {
    branches,
    products,
    techCards
  };
}
