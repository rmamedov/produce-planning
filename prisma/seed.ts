import { addHours, subHours } from "date-fns";
import { PrismaClient, TaskPriority, TaskStatus, TimelinessStatus } from "@prisma/client";

import { createMockData } from "@/mock/sample-data";
import { formatTitle } from "@/lib/utils";
import { taskGenerationService } from "@/services/task-generation/task-generation.service";

const prisma = new PrismaClient();

async function main() {
  const mock = createMockData();

  await prisma.task.deleteMany();
  await prisma.forecast.deleteMany();
  await prisma.assortmentItem.deleteMany();
  await prisma.assortment.deleteMany();
  await prisma.product.deleteMany();
  await prisma.techCardIngredient.deleteMany();
  await prisma.techCardStep.deleteMany();
  await prisma.techCardEquipment.deleteMany();
  await prisma.technologicalCard.deleteMany();
  await prisma.branch.deleteMany();
  await prisma.settings.deleteMany();

  await prisma.settings.create({
    data: mock.settings
  });

  const branches = new Map<string, string>();
  for (const branch of mock.branches) {
    const created = await prisma.branch.create({
      data: {
        name: branch.name,
        address: branch.address
      }
    });
    branches.set(branch.slug, created.id);
  }

  const techCards = new Map<string, string>();
  for (const techCard of mock.techCards) {
    const created = await prisma.technologicalCard.create({
      data: {
        name: techCard.name,
        typicalCookingTimeMinutes: techCard.typicalCookingTimeMinutes,
        ingredients: {
          create: techCard.ingredients
        },
        steps: {
          create: techCard.steps
        },
        requiredEquipment: {
          create: techCard.requiredEquipment.map((label) => ({ label }))
        }
      }
    });
    techCards.set(techCard.slug, created.id);
  }

  const products = new Map<string, string>();
  for (const product of mock.products) {
    const created = await prisma.product.create({
      data: {
        name: product.name,
        photoUrl: product.photoUrl,
        unitWeight: product.unitWeight,
        technologicalCardId: techCards.get(product.techCardSlug) ?? null
      }
    });
    products.set(product.slug, created.id);
  }

  for (const assortment of mock.assortments) {
    const branchId = branches.get(assortment.branchSlug)!;
    await prisma.assortment.create({
      data: {
        branchId,
        items: {
          create: assortment.items.map((item) => ({
            productId: products.get(item.productSlug)!,
            currentStock: item.currentStock,
            hourlyTargetStock: item.hourlyTargetStock
          }))
        }
      }
    });
  }

  await prisma.forecast.createMany({
    data: mock.forecasts.map((forecast) => ({
      branchId: branches.get(forecast.branchSlug)!,
      productId: products.get(forecast.productSlug)!,
      hour: forecast.hour,
      forecastedSalesQty: forecast.forecastedSalesQty
    }))
  });

  const podilBranchId = branches.get("podil")!;
  const syrnykyProductId = products.get("syrnyky")!;
  await prisma.task.create({
    data: {
      branchId: podilBranchId,
      productId: syrnykyProductId,
      quantity: 6,
      title: formatTitle("Сирники", 6),
      status: TaskStatus.DONE,
      timelinessStatus: TimelinessStatus.ON_TIME,
      priority: TaskPriority.MEDIUM,
      allocatedTimeMinutes: 25,
      expectedReadyAt: addHours(new Date(), -1),
      priorityReason: "Історичне виконане завдання для демо-даних.",
      createdAt: subHours(new Date(), 2),
      startedAt: subHours(new Date(), 2),
      completedAt: subHours(new Date(), 1),
      manual: false
    }
  });

  await taskGenerationService.generateAll();
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
