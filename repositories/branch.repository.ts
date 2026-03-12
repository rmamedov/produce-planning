import type { Branch } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export const branchRepository = {
  list() {
    return prisma.branch.findMany({
      orderBy: {
        name: "asc"
      }
    });
  },

  getById(id: string) {
    return prisma.branch.findUnique({
      where: { id }
    });
  },

  create(data: Pick<Branch, "name" | "address">) {
    return prisma.branch.create({
      data
    });
  },

  update(id: string, data: Pick<Branch, "name" | "address">) {
    return prisma.branch.update({
      where: { id },
      data
    });
  },

  delete(id: string) {
    return prisma.branch.delete({
      where: { id }
    });
  }
};
