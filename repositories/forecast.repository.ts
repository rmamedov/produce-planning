import type { Forecast } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { forecastInclude } from "@/repositories/shared";

type ForecastPayload = Pick<Forecast, "branchId" | "productId" | "hour" | "forecastedSalesQty">;

export const forecastRepository = {
  list() {
    return prisma.forecast.findMany({
      include: forecastInclude,
      orderBy: [
        { hour: "asc" },
        { branch: { name: "asc" } },
        { product: { name: "asc" } }
      ]
    });
  },

  getById(id: string) {
    return prisma.forecast.findUnique({
      where: { id },
      include: forecastInclude
    });
  },

  create(data: ForecastPayload) {
    return prisma.forecast.create({
      data,
      include: forecastInclude
    });
  },

  update(id: string, data: ForecastPayload) {
    return prisma.forecast.update({
      where: { id },
      data,
      include: forecastInclude
    });
  },

  delete(id: string) {
    return prisma.forecast.delete({
      where: { id }
    });
  }
};
