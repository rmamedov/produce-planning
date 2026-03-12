import type { Prisma, PrismaClient } from "@prisma/client";

export type DbClient = PrismaClient | Prisma.TransactionClient;

export const techCardInclude = {
  ingredients: {
    orderBy: {
      ingredientName: "asc"
    }
  },
  steps: {
    orderBy: {
      stepNumber: "asc"
    }
  },
  requiredEquipment: {
    orderBy: {
      label: "asc"
    }
  }
} satisfies Prisma.TechnologicalCardInclude;

export const productInclude = {
  technologicalCard: {
    include: techCardInclude
  }
} satisfies Prisma.ProductInclude;

export const assortmentInclude = {
  branch: true,
  items: {
    include: {
      product: {
        include: productInclude
      }
    },
    orderBy: {
      createdAt: "asc"
    }
  }
} satisfies Prisma.AssortmentInclude;

export const forecastInclude = {
  branch: true,
  product: true
} satisfies Prisma.ForecastInclude;

export const taskInclude = {
  branch: true,
  product: {
    include: {
      technologicalCard: {
        include: techCardInclude
      }
    }
  }
} satisfies Prisma.TaskInclude;
