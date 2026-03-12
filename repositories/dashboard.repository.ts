import { TaskPriority, TaskStatus, TimelinessStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { taskInclude } from "@/repositories/shared";

export const dashboardRepository = {
  async getStats() {
    const [branchesCount, productsCount, activeTasksCount, overdueTasksCount, recentTasks, criticalProducts] =
      await Promise.all([
        prisma.branch.count(),
        prisma.product.count(),
        prisma.task.count({
          where: {
            status: {
              in: [TaskStatus.NEW, TaskStatus.IN_PROGRESS]
            }
          }
        }),
        prisma.task.count({
          where: {
            status: {
              in: [TaskStatus.NEW, TaskStatus.IN_PROGRESS]
            },
            timelinessStatus: TimelinessStatus.OVERDUE
          }
        }),
        prisma.task.findMany({
          include: taskInclude,
          orderBy: {
            createdAt: "desc"
          },
          take: 6
        }),
        prisma.assortmentItem.findMany({
          where: {
            currentStock: {
              lte: 2
            }
          },
          include: {
            assortment: {
              include: {
                branch: true
              }
            },
            product: true
          },
          orderBy: [
            {
              currentStock: "asc"
            },
            {
              hourlyTargetStock: "desc"
            }
          ],
          take: 6
        })
      ]);

    return {
      branchesCount,
      productsCount,
      activeTasksCount,
      overdueTasksCount,
      recentTasks,
      criticalProducts: criticalProducts.map((item) => ({
        branchName: item.assortment.branch.name,
        productName: item.product.name,
        currentStock: item.currentStock,
        hourlyTargetStock: item.hourlyTargetStock
      })),
      priorities: await prisma.task.groupBy({
        by: ["priority"],
        _count: true,
        where: {
          priority: {
            in: [TaskPriority.CRITICAL, TaskPriority.HIGH, TaskPriority.MEDIUM, TaskPriority.LOW]
          }
        }
      })
    };
  }
};
