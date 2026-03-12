import type { Settings } from "@prisma/client";

import { prisma } from "@/lib/prisma";

type SettingsPayload = Pick<
  Settings,
  "companyName" | "planningHorizonHours" | "generationIntervalMinutes" | "kitchenBoardRefreshSec"
>;

export const settingsRepository = {
  async getSingleton() {
    const existing = await prisma.settings.findFirst();
    if (existing) {
      return existing;
    }

    return prisma.settings.create({
      data: {}
    });
  },

  async update(payload: SettingsPayload) {
    const current = await this.getSingleton();
    return prisma.settings.update({
      where: {
        id: current.id
      },
      data: payload
    });
  }
};
