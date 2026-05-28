import { prisma } from "@/lib/prisma";

interface IngestItem {
  filialId: number;
  historyDate: Date;
  snapshotHour: number | null;
  lagerId: number;
  priority: number;
  coveredHours: number;
  currentStockQty: number;
  demandTillDayEnd: number;
  demandWholeDay: number;
  recommendedToProduce: number;
  salesQty: number;
  producedQty: number;
  demandBeforeQty: number;
}

interface ListFilters {
  filialId: number;
  historyDate?: Date;
  priority?: number;
  lagerId?: number;
}

export const productionPlanPriorityRepository = {
  async upsertMany(items: IngestItem[]) {
    const operations = items.map((item) =>
      prisma.productionPlanPriority.upsert({
        where: {
          filialId_historyDate_lagerId: {
            filialId: item.filialId,
            historyDate: item.historyDate,
            lagerId: item.lagerId
          }
        },
        update: {
          snapshotHour: item.snapshotHour,
          priority: item.priority,
          coveredHours: item.coveredHours,
          currentStockQty: item.currentStockQty,
          demandTillDayEnd: item.demandTillDayEnd,
          demandWholeDay: item.demandWholeDay,
          recommendedToProduce: item.recommendedToProduce,
          salesQty: item.salesQty,
          producedQty: item.producedQty,
          demandBeforeQty: item.demandBeforeQty
        },
        create: item
      })
    );

    return prisma.$transaction(operations);
  },

  async list(filters: ListFilters) {
    const where: Record<string, unknown> = {
      filialId: filters.filialId
    };

    if (filters.historyDate) {
      where.historyDate = filters.historyDate;
    }
    if (filters.priority) {
      where.priority = filters.priority;
    }
    if (filters.lagerId) {
      where.lagerId = filters.lagerId;
    }

    return prisma.productionPlanPriority.findMany({
      where,
      orderBy: [
        { historyDate: "asc" },
        { priority: "asc" },
        { coveredHours: "asc" }
      ]
    });
  }
};
