import { prisma } from "@/lib/prisma";
import type { DbClient } from "@/repositories/shared";

export const taskStatusLogService = {
  async log(taskId: string, fromStatus: string | null, toStatus: string, db?: DbClient) {
    const client = db ?? prisma;
    return client.taskStatusLog.create({
      data: { taskId, fromStatus, toStatus }
    });
  },

  async getByTaskId(taskId: string) {
    return prisma.taskStatusLog.findMany({
      where: { taskId },
      orderBy: { changedAt: "asc" }
    });
  }
};
