import type { Presentation } from "@/features/production-tasks/types";
import { groupPresentationTasks, plural, type GroupableTask } from "@/lib/presentation-grouping";

export const WINDOW_MIN_HOURS = 0.5;
export const WINDOW_MAX_HOURS = 24;
export const DEFAULT_WINDOW_HOURS = 5;
export const WINDOW_PRESETS = [2, 3, 4, 5, 6, 8];
export const DUPLICATE_NAME_MESSAGE = "Представлення з такою назвою вже є";

const FILIAL_FORMS: [string, string, string] = ["філія", "філії", "філій"];
const BATCH_ACCUSATIVE_FORMS: [string, string, string] = ["партію", "партії", "партій"];
const ACTIVE_TASK_FORMS: [string, string, string] = ["активна задача", "активні задачі", "активних задач"];

export function countLabel(n: number, forms: [string, string, string]) {
  return `${n} ${plural(n, forms)}`;
}

export const filialCountLabel = (n: number) => countLabel(n, FILIAL_FORMS);
export const batchCountLabel = (n: number) => countLabel(n, BATCH_ACCUSATIVE_FORMS);
export const activeTasksLabel = (n: number) => countLabel(n, ACTIVE_TASK_FORMS);

/** «0,5», «5», «7,5» — hours with a decimal comma. */
export function formatHours(hours: number) {
  return String(Math.round(hours * 10) / 10).replace(".", ",");
}

/** Accepts «5», «0,5», «7.5», «,5»; anything else is null. */
export function parseHoursInput(raw: string): number | null {
  const normalized = raw.trim().replace(",", ".");

  if (!/^(\d+(\.\d*)?|\.\d+)$/.test(normalized)) {
    return null;
  }

  return Number(normalized);
}

export function isValidWindowHours(hours: number | null): hours is number {
  return hours !== null && hours >= WINDOW_MIN_HOURS && hours <= WINDOW_MAX_HOURS && Number.isInteger(hours * 2);
}

/** Next half-hour step from whatever is typed; an off-grid value snaps to the neighbouring step. */
export function stepHours(raw: string, direction: 1 | -1) {
  const current = parseHoursInput(raw) ?? DEFAULT_WINDOW_HOURS;
  const halfSteps = direction > 0 ? Math.floor(current * 2) + 1 : Math.ceil(current * 2) - 1;

  return formatHours(Math.min(WINDOW_MAX_HOURS, Math.max(WINDOW_MIN_HOURS, halfSteps / 2)));
}

/** «3 філії: Березнева · Січових Стрільців · Дніпровська Наб. 33» */
export function formatFilialsLine(filialIds: number[], shortName: (filialId: number) => string) {
  return `${filialCountLabel(filialIds.length)}: ${filialIds.map(shortName).join(" · ")}`;
}

/** «Виробник: Березнева»; null when every filial produces for itself. */
export function formatProducerLine(productionFilialId: number | null, shortName: (filialId: number) => string) {
  return productionFilialId === null ? null : `Виробник: ${shortName(productionFilialId)}`;
}

export function isDuplicateName(name: string, presentations: Presentation[], editingId: string | null) {
  const normalized = name.trim().toLocaleLowerCase("uk");

  return presentations.some(
    (presentation) => presentation.id !== editingId && presentation.name.trim().toLocaleLowerCase("uk") === normalized
  );
}

/** Selected filials that already belong to other presentations, and those presentations' names. */
export function findOverlaps(selectedIds: number[], presentations: Presentation[], editingId: string | null) {
  const others = presentations.filter((presentation) => presentation.id !== editingId);
  const filialIds = selectedIds.filter((id) => others.some((presentation) => presentation.filial_ids.includes(id)));
  const presentationNames = others
    .filter((presentation) => presentation.filial_ids.some((id) => filialIds.includes(id)))
    .map((presentation) => presentation.name);

  return { filialIds, presentationNames };
}

export function filialCountWarning(count: number) {
  if (count > 6) {
    return "Більше 6 філій не рекомендовано: колонки на планшеті стануть нечитабельними. Розбийте на кілька представлень.";
  }

  if (count > 4) {
    return "На планшеті 1340 px вміщується 4 колонки філій у повний розмір; для 5–6 колонки звузяться.";
  }

  return null;
}

/** Readiness of the synthetic example orders, minutes from midnight: 09:10, 10:05, 12:10, 17:20. */
export const EXAMPLE_ORDER_MINUTES = [550, 605, 730, 1040];

const EXAMPLE_DAY_MS = Date.UTC(2026, 0, 5);

export interface ExampleOrder {
  filialId: number;
  minute: number;
}

export interface ExampleBatch {
  start: number;
  end: number;
  filialIds: number[];
}

export interface GroupingExample {
  orders: ExampleOrder[];
  batches: ExampleBatch[];
}

/**
 * Orders of one article assigned round-robin to the selected filials, grouped exactly
 * as the kitchen tablet groups them. Null until there are 2 filials and a valid window.
 */
export function buildGroupingExample(filialIds: number[], windowHours: number | null): GroupingExample | null {
  if (filialIds.length < 2 || !isValidWindowHours(windowHours)) {
    return null;
  }

  const windowMinutes = windowHours * 60;
  const orders = EXAMPLE_ORDER_MINUTES.map((minute, index) => ({
    filialId: filialIds[index % filialIds.length],
    minute
  }));
  const tasks: GroupableTask[] = orders.map((order, index) => ({
    id: `example-${index}`,
    filial_id: order.filialId,
    lager_id: 1,
    lager_name: "Приклад",
    unit: "шт",
    status: "NEW",
    priority: "MEDIUM",
    quantity: 10,
    operational_ready_at: new Date(EXAMPLE_DAY_MS + order.minute * 60_000).toISOString(),
    history_date: "2026-01-05",
    batch_id: null,
    started_at: null,
    promo_mechanics: null,
    is_guest_promise: false,
    ecom_orders_qty: null,
    bakery_type: null
  }));

  const batches = groupPresentationTasks(tasks, windowMinutes)
    .filter((group) => group.deadline !== null)
    .map((group) => {
      const start = ((group.deadline as number) - EXAMPLE_DAY_MS) / 60_000;

      return {
        start,
        end: start + windowMinutes,
        filialIds: [...new Set(group.members.map((member) => member.filial_id))]
      };
    })
    .sort((a, b) => a.start - b.start);

  return { orders, batches };
}

/** «09:10»; past midnight — «09:10 (+1 доба)». */
export function formatMinuteOfDay(minute: number) {
  const day = Math.floor(minute / 1440);
  const rest = minute - day * 1440;
  const time = `${String(Math.floor(rest / 60)).padStart(2, "0")}:${String(rest % 60).padStart(2, "0")}`;

  return day > 0 ? `${time} (+1 доба)` : time;
}
