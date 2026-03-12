import type { Product } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { productInclude } from "@/repositories/shared";

type ProductPayload = Pick<Product, "name" | "photoUrl" | "unitWeight" | "technologicalCardId">;

export const productRepository = {
  list() {
    return prisma.product.findMany({
      include: productInclude,
      orderBy: {
        name: "asc"
      }
    });
  },

  getById(id: string) {
    return prisma.product.findUnique({
      where: { id },
      include: productInclude
    });
  },

  create(data: ProductPayload) {
    return prisma.product.create({
      data,
      include: productInclude
    });
  },

  update(id: string, data: ProductPayload) {
    return prisma.product.update({
      where: { id },
      data,
      include: productInclude
    });
  },

  delete(id: string) {
    return prisma.product.delete({
      where: { id }
    });
  }
};
