import { prisma } from "@/lib/prisma";
import { assortmentInclude } from "@/repositories/shared";

type AssortmentPayload = {
  branchId: string;
  items: Array<{
    productId: string;
    currentStock: number;
    hourlyTargetStock: number;
  }>;
};

export const assortmentRepository = {
  list() {
    return prisma.assortment.findMany({
      include: assortmentInclude,
      orderBy: {
        branch: {
          name: "asc"
        }
      }
    });
  },

  getById(id: string) {
    return prisma.assortment.findUnique({
      where: { id },
      include: assortmentInclude
    });
  },

  async upsert(payload: AssortmentPayload) {
    return prisma.$transaction(async (tx) => {
      const assortment = await tx.assortment.upsert({
        where: {
          branchId: payload.branchId
        },
        create: {
          branchId: payload.branchId
        },
        update: {}
      });

      await tx.assortmentItem.deleteMany({
        where: {
          assortmentId: assortment.id
        }
      });

      if (payload.items.length) {
        await tx.assortmentItem.createMany({
          data: payload.items.map((item) => ({
            assortmentId: assortment.id,
            productId: item.productId,
            currentStock: item.currentStock,
            hourlyTargetStock: item.hourlyTargetStock
          }))
        });
      }

      return tx.assortment.findUniqueOrThrow({
        where: {
          id: assortment.id
        },
        include: assortmentInclude
      });
    });
  },

  delete(id: string) {
    return prisma.assortment.delete({
      where: { id }
    });
  }
};
