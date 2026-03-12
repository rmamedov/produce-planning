import { TaskPriority, TaskStatus, TimelinessStatus } from "@/domain/enums";

export type ForecastSlot = {
  hour: Date;
  forecastedSalesQty: number;
};

export type PlanningProductSnapshot = {
  branchId: string;
  branchName: string;
  productId: string;
  productName: string;
  currentStock: number;
  hourlyTargetStock: number;
  cookingTimeMinutes: number;
  activeTaskQuantity: number;
  activeTaskStatus: TaskStatus | null;
  activeTaskId: string | null;
  activeTaskManual: boolean;
  forecasts: ForecastSlot[];
};

export type GeneratedTaskDecision = {
  availableStock: number;
  forecastDemand: number;
  requiredStock: number;
  deficit: number;
  taskQuantity: number;
  shortageHour: Date | null;
  expectedReadyAt: Date | null;
  allocatedTimeMinutes: number;
  coverageHours: number;
  priority: TaskPriority;
  priorityReason: string;
  timelinessStatus: TimelinessStatus;
  shouldCreateTask: boolean;
  reason?: string;
};
