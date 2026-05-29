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

export const productionPlanPriorityItemSchema = z.object({
  lager_id: z.number().int().positive("lager_id має бути додатним цілим числом"),
  // V2: optional product full name (from dim_lagers).
  lagerfullname: z.string().optional(),
  priority: z.number().int().min(1).max(4, "priority має бути від 1 до 4"),
  covered_hours: z.number().min(0, "covered_hours не може бути від'ємним"),
  current_stock_qty: z.number().min(0, "current_stock_qty не може бути від'ємним"),
  demand_till_day_end: z.number().min(0, "demand_till_day_end не може бути від'ємним"),
  demand_whole_day: z.number().min(0, "demand_whole_day не може бути від'ємним"),
  recommended_to_produce: z.number().min(0, "recommended_to_produce не може бути від'ємним"),
  // V2: sales_qty / produced_qty are now optional and may be null.
  sales_qty: z.number().min(0, "sales_qty не може бути від'ємним").nullable().optional(),
  produced_qty: z.number().min(0, "produced_qty не може бути від'ємним").nullable().optional(),
  demand_before_qty: z.number().min(0, "demand_before_qty не може бути від'ємним")
});

export const productionPlanPriorityDateEntrySchema = z.object({
  history_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "history_date має бути у форматі YYYY-MM-DD"),
  snapshot_hour: z.number().int().min(0).max(23).nullable(),
  items: z.array(productionPlanPriorityItemSchema).min(1, "Додайте хоча б один item")
});

export const productionPlanPriorityIngestSchema = z.object({
  filial_id: z.number().int().positive("filial_id має бути додатним цілим числом"),
  // V2: department identifier for the batch (optional for backward compatibility).
  department_id: z.number().int().positive("department_id має бути додатним цілим числом").optional(),
  dates: z.array(productionPlanPriorityDateEntrySchema).min(1, "Додайте хоча б одну дату")
});

export const productionPlanPriorityQuerySchema = z.object({
  filial_id: z.coerce.number().int().positive("filial_id має бути додатним цілим числом"),
  history_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "history_date має бути у форматі YYYY-MM-DD").optional(),
  priority: z.coerce.number().int().min(1).max(4).optional(),
  lager_id: z.coerce.number().int().positive().optional(),
  // V2: filter by department.
  department_id: z.coerce.number().int().positive().optional()
});

export const productionTaskQuerySchema = z.object({
  filial_id: z.coerce.number().int().positive().optional(),
  history_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "history_date має бути у форматі YYYY-MM-DD").optional(),
  status: z.enum(["NEW", "IN_PROGRESS", "DONE", "CANCELLED"]).optional(),
  priority: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]).optional()
});

export const productionTaskGenerateSchema = z.object({
  filial_id: z.coerce.number().int().positive("filial_id має бути додатним цілим числом").optional()
});

export const settingsSchema = z.object({
  companyName: z.string().min(2, "Назва компанії обов'язкова"),
  planningHorizonHours: z.coerce.number().int().min(1).max(12),
  generationIntervalMinutes: z.coerce.number().int().min(5).max(60),
  kitchenBoardRefreshSec: z.coerce.number().int().min(10).max(300)
});
