import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { techCardInclude } from "@/repositories/shared";

type TechCardPayload = {
  name: string;
  typicalCookingTimeMinutes: number;
  ingredients: Array<{
    ingredientName: string;
    quantity: number;
    unit: string;
  }>;
  steps: Array<{
    stepNumber: number;
    description: string;
  }>;
  requiredEquipment: string[];
};

function buildTechCardData(payload: TechCardPayload): Prisma.TechnologicalCardCreateInput {
  return {
    name: payload.name,
    typicalCookingTimeMinutes: payload.typicalCookingTimeMinutes,
    ingredients: {
      create: payload.ingredients
    },
    steps: {
      create: payload.steps
    },
    requiredEquipment: {
      create: payload.requiredEquipment.map((label) => ({ label }))
    }
  };
}

export const techCardRepository = {
  list() {
    return prisma.technologicalCard.findMany({
      include: techCardInclude,
      orderBy: {
        name: "asc"
      }
    });
  },

  getById(id: string) {
    return prisma.technologicalCard.findUnique({
      where: { id },
      include: techCardInclude
    });
  },

  create(payload: TechCardPayload) {
    return prisma.technologicalCard.create({
      data: buildTechCardData(payload),
      include: techCardInclude
    });
  },

  async update(id: string, payload: TechCardPayload) {
    return prisma.$transaction(async (tx) => {
      await tx.techCardIngredient.deleteMany({
        where: {
          technologicalCardId: id
        }
      });
      await tx.techCardStep.deleteMany({
        where: {
          technologicalCardId: id
        }
      });
      await tx.techCardEquipment.deleteMany({
        where: {
          technologicalCardId: id
        }
      });

      return tx.technologicalCard.update({
        where: { id },
        data: buildTechCardData(payload),
        include: techCardInclude
      });
    });
  },

  delete(id: string) {
    return prisma.technologicalCard.delete({
      where: { id }
    });
  }
};
