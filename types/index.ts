import type {
  Assortment,
  AssortmentItem,
  Branch,
  Forecast,
  Product,
  Settings,
  Task,
  TechnologicalCard,
  TechCardEquipment,
  TechCardIngredient,
  TechCardStep
} from "@prisma/client";

import { TaskPriority, TaskStatus, TimelinessStatus } from "@/domain/enums";

export type BranchDto = Branch;

export type ProductDto = Product & {
  technologicalCard?: TechnologicalCard | null;
};

export type TechCardDto = TechnologicalCard & {
  ingredients: TechCardIngredient[];
  steps: TechCardStep[];
  requiredEquipment: TechCardEquipment[];
};

export type AssortmentDto = Assortment & {
  branch: Branch;
  items: Array<
    AssortmentItem & {
      product: Product;
    }
  >;
};

export type ForecastDto = Forecast & {
  branch: Branch;
  product: Product;
};

export type TaskDto = Task & {
  branch: Branch;
  product: Product & {
    technologicalCard?: TechCardDto | null;
  };
};

export type DashboardStats = {
  branchesCount: number;
  productsCount: number;
  activeTasksCount: number;
  overdueTasksCount: number;
  criticalProducts: Array<{
    branchName: string;
    productName: string;
    currentStock: number;
    hourlyTargetStock: number;
  }>;
  recentTasks: TaskDto[];
};

export type SettingsDto = Settings;

export type Option = {
  label: string;
  value: string;
};

export type TaskFormStatus = TaskStatus;
export type TaskFormPriority = TaskPriority;
export type TaskFormTimeliness = TimelinessStatus;
