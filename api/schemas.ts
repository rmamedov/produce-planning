import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Вкажіть коректний email"),
  password: z.string().min(8, "Пароль має містити щонайменше 8 символів")
});

export const branchSchema = z.object({
  name: z.string().min(2, "Назва має містити щонайменше 2 символи"),
  address: z.string().min(4, "Адреса має містити щонайменше 4 символи")
});

export const ingredientSchema = z.object({
  ingredientName: z.string().min(1, "Назва інгредієнта обов'язкова"),
  quantity: z.coerce.number().positive("Кількість має бути більшою за 0"),
  unit: z.string().min(1, "Одиниця виміру обов'язкова")
});

export const techCardStepSchema = z.object({
  stepNumber: z.coerce.number().int().positive("Номер кроку має бути більше 0"),
  description: z.string().min(3, "Опис кроку обов'язковий")
});

export const techCardSchema = z.object({
  name: z.string().min(2, "Назва техкарти має містити щонайменше 2 символи"),
  typicalCookingTimeMinutes: z.coerce
    .number()
    .int()
    .positive("Час приготування має бути додатним"),
  ingredients: z.array(ingredientSchema).min(1, "Додайте хоча б один інгредієнт"),
  steps: z.array(techCardStepSchema).min(1, "Додайте хоча б один крок"),
  requiredEquipment: z.array(z.string().min(1, "Назва обладнання обов'язкова")).min(1, "Додайте обладнання")
});

export const productSchema = z.object({
  name: z.string().min(2, "Назва товару має містити щонайменше 2 символи"),
  photoUrl: z.string().url("Посилання на фото має бути валідним").or(z.literal("")).optional(),
  unitWeight: z.coerce.number().int().positive("Вага має бути додатною"),
  technologicalCardId: z.string().nullable().optional()
});

export const assortmentItemSchema = z.object({
  productId: z.string().min(1, "Оберіть товар"),
  currentStock: z.coerce.number().int().min(0, "Залишок не може бути від'ємним"),
  hourlyTargetStock: z.coerce.number().int().min(0, "Цільовий запас не може бути від'ємним")
});

export const assortmentSchema = z.object({
  branchId: z.string().min(1, "Оберіть філію"),
  items: z.array(assortmentItemSchema).min(1, "Додайте хоча б один товар")
});

export const forecastSchema = z.object({
  branchId: z.string().min(1, "Оберіть філію"),
  productId: z.string().min(1, "Оберіть товар"),
  hour: z.string().datetime("Дата й година повинні бути у форматі ISO"),
  forecastedSalesQty: z.coerce.number().int().min(0, "Прогноз не може бути від'ємним")
});

export const manualTaskSchema = z.object({
  branchId: z.string().min(1, "Оберіть філію"),
  productId: z.string().min(1, "Оберіть товар"),
  quantity: z.coerce.number().int().positive("Кількість має бути додатною"),
  priority: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]),
  expectedReadyAt: z.string().datetime("Дата готовності повинна бути у форматі ISO"),
  comment: z.string().max(200, "Коментар має містити до 200 символів").optional()
});

export const settingsSchema = z.object({
  companyName: z.string().min(2, "Назва компанії обов'язкова"),
  planningHorizonHours: z.coerce.number().int().min(1).max(12),
  generationIntervalMinutes: z.coerce.number().int().min(5).max(60),
  kitchenBoardRefreshSec: z.coerce.number().int().min(10).max(300)
});
