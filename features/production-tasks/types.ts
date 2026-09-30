// API shapes shared by the kitchen board, the presentation view and the
// admin presentations page (snake_case, exactly as the routes return them).

export type KitchenTaskStatus = "NEW" | "IN_PROGRESS" | "DONE" | "CANCELLED";
export type KitchenTaskPriority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export interface KitchenTask {
  id: string;
  filial_id: number;
  department_id: number | null;
  department_name: string | null;
  lager_id: number;
  lager_name: string | null;
  unit: string | null;
  snapshot_hour: number | null;
  history_date: string;
  status: KitchenTaskStatus;
  priority: KitchenTaskPriority;
  priority_level: number;
  quantity: number;
  max_quantity?: number;
  covered_hours: number;
  current_stock_qty: number | null;
  is_guest_promise: boolean;
  promo_mechanics: string | null;
  ecom_orders_qty: number | null;
  bakery_type: string | null;
  reason: string;
  operational_ready_at: string | null;
  is_overdue: boolean;
  produced_qty: number | null;
  created_at?: string;
  started_at: string | null;
  completed_at: string | null;
  documented_at: string | null;
  transfer_id: string | null;
  /** Shared by every task started together as one batch (null when not started). */
  batch_id: string | null;
}

export interface KitchenTasksResponse {
  generated_at: string;
  count: number;
  tasks: KitchenTask[];
}

/** A named set of filials whose orders the kitchen produces together. */
export interface Presentation {
  id: string;
  name: string;
  filial_ids: number[];
  window_minutes: number;
  window_hours: number;
}

export interface PresentationsResponse {
  presentations: Presentation[];
}

export interface FilialSummary {
  filial_id: number;
  name: string;
  short_name: string;
  active_tasks: number;
}
