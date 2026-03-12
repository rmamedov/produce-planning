import { Prisma, TaskStatus } from "@prisma/client";
import { addHours, startOfHour } from "date-fns";

import type { PlanningProductSnapshot } from "@/domain/task-generation";
import { prisma } from "@/lib/prisma";
import type { DbClient } from "@/repositories/shared";

export const planningRepository = {
  async listPlanningTargets() {
    return prisma.assortmentItem.findMany({
      select: {
        id: true
      },
      orderBy: {
        createdAt: "asc"
      }
    });
  },

  async lockAssortmentItem(db: DbClient, assortmentItemId: string) {
    await db.$queryRaw`SELECT id FROM "AssortmentItem" WHERE id = ${assortmentItemId} FOR UPDATE`;
    await db.$queryRaw`
      SELECT id
      FROM "Task"
      WHERE "branchId" = (
        SELECT a."branchId"
        FROM "AssortmentItem" ai
        INNER JOIN "Assortment" a ON a.id = ai."assortmentId"
        WHERE ai.id = ${assortmentItemId}
      )
      AND "productId" = (
        SELECT "productId"
        FROM "AssortmentItem"
        WHERE id = ${assortmentItemId}
      )
      AND "status" IN ('NEW', 'IN_PROGRESS')
      FOR UPDATE
    `;
  },

  async getSnapshot(
    db: DbClient,
    assortmentItemId: string,
    now: Date,
    horizonHours: number
  ): Promise<PlanningProductSnapshot | null> {
    const assortmentItem = await db.assortmentItem.findUnique({
      where: {
        id: assortmentItemId
      },
      include: {
        assortment: {
          include: {
            branch: true
          }
        },
        product: {
          include: {
            technologicalCard: true
          }
        }
      }
    });

    if (!assortmentItem) {
      return null;
    }

    const horizonStart = startOfHour(now);
    const horizonEnd = addHours(horizonStart, horizonHours);

    const [activeTasks, forecasts] = await Promise.all([
      db.task.findMany({
        where: {
          branchId: assortmentItem.assortment.branchId,
          productId: assortmentItem.productId,
          status: {
            in: [TaskStatus.NEW, TaskStatus.IN_PROGRESS]
          }
        },
        orderBy: {
          createdAt: "asc"
        }
      }),
      db.forecast.findMany({
        where: {
          branchId: assortmentItem.assortment.branchId,
          productId: assortmentItem.productId,
          hour: {
            gte: horizonStart,
            lt: horizonEnd
          }
        },
        orderBy: {
          hour: "asc"
        }
      })
    ]);

    const activeTask = activeTasks[0] ?? null;
    const activeTaskQuantity = activeTasks.reduce((sum, task) => sum + task.quantity, 0);

    return {
      branchId: assortmentItem.assortment.branchId,
      branchName: assortmentItem.assortment.branch.name,
      productId: assortmentItem.productId,
      productName: assortmentItem.product.name,
      currentStock: assortmentItem.currentStock,
      hourlyTargetStock: assortmentItem.hourlyTargetStock,
      cookingTimeMinutes: assortmentItem.product.technologicalCard?.typicalCookingTimeMinutes ?? 30,
      activeTaskId: activeTask?.id ?? null,
      activeTaskManual: activeTask?.manual ?? false,
      activeTaskQuantity,
      activeTaskStatus: activeTask?.status ?? null,
      forecasts: forecasts.map((forecast) => ({
        hour: forecast.hour,
        forecastedSalesQty: forecast.forecastedSalesQty
      }))
    };
  },

  async updateStock(db: DbClient, branchId: string, productId: string, currentStock: number) {
    const assortment = await db.assortment.findUnique({
      where: {
        branchId
      }
    });

    if (!assortment) {
      throw new Error("Assortment not found for branch");
    }

    return db.assortmentItem.update({
      where: {
        assortmentId_productId: {
          assortmentId: assortment.id,
          productId
        }
      },
      data: {
        currentStock
      }
    });
  },

  async findAssortmentItemId(branchId: string, productId: string) {
    const assortment = await prisma.assortment.findUnique({
      where: {
        branchId
      }
    });

    if (!assortment) {
      return null;
    }

    const item = await prisma.assortmentItem.findUnique({
      where: {
        assortmentId_productId: {
          assortmentId: assortment.id,
          productId
        }
      },
      select: {
        id: true
      }
    });

    return item?.id ?? null;
  },

  transaction<T>(callback: (db: Prisma.TransactionClient) => Promise<T>) {
    return prisma.$transaction(callback, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable
    });
  }
};
