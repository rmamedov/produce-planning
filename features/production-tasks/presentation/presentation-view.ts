// Pure view logic of the kitchen presentation view (labels, filial tiles,
// layouts, the prep sheet and the group-completion input). Unit-tested in
// tests/presentation-view.test.ts; grouping itself lives in
// lib/presentation-grouping.ts.

import { getFilialShortName } from "@/domain/filials";
import {
  distributeProduced,
  normPriority,
  plural,
  priorityRankOf,
  readyMs,
  type GroupableTask,
  type NormPriority,
  type TaskGroup,
  type Unit
} from "@/lib/presentation-grouping";
import {
  appendComma,
  appendDigit,
  backspaceValue,
  clearValue,
  formatQuantity,
  parseQuantity,
  stepValue
} from "@/lib/produced-quantity-input";
import { BAKERY_TYPES } from "@/lib/task-badges";

type Forms = [string, string, string];

export const WORDS: Record<
  "batch" | "batchAcc" | "task" | "filial" | "filialAcc" | "order" | "position",
  Forms
> = {
  batch: ["партія", "партії", "партій"],
  batchAcc: ["партію", "партії", "партій"],
  task: ["задача", "задачі", "задач"],
  filial: ["філія", "філії", "філій"],
  filialAcc: ["філію", "філії", "філій"],
  order: ["замовлення", "замовлення", "замовлень"],
  position: ["позиція", "позиції", "позицій"]
};

/** «3 філії», «1 партія», «5 задач». */
export function countLabel(n: number, forms: Forms): string {
  return `${n} ${plural(n, forms)}`;
}

/** Display quantity: one decimal at most, comma separator («1,5»). */
export function formatQty(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return String(rounded === 0 ? 0 : rounded).replace(".", ",");
}

/** «90 шт + 6 кг» — the two units are never added together. */
export function qtyPair(pcs: number, kg: number): string {
  const parts: string[] = [];
  if (Math.round(pcs * 10) !== 0) parts.push(`${formatQty(pcs)} шт`);
  if (Math.round(kg * 10) !== 0) parts.push(`${formatQty(kg)} кг`);
  return parts.length ? parts.join(" + ") : "0";
}

/** Grouping window: 300 → «5 год», 30 → «0,5 год». */
export function formatWindowHours(windowMinutes: number): string {
  return `${formatQty(windowMinutes / 60)} год`;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/** «09:10» in the tablet's local time. */
export function clockTime(ms: number): string {
  const date = new Date(ms);
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function localDayNumber(ms: number): number {
  const date = new Date(ms);
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000;
}

/** Local day of `ms` relative to `now`: null (today), «завтра», «вчора» or «01.10». */
export function clockDay(ms: number, now: number): string | null {
  const diff = localDayNumber(ms) - localDayNumber(now);
  if (diff === 0) return null;
  if (diff === 1) return "завтра";
  if (diff === -1) return "вчора";
  const date = new Date(ms);
  return `${pad2(date.getDate())}.${pad2(date.getMonth() + 1)}`;
}

/**
 * «09:10» today, otherwise prefixed with the day («завтра 00:43»). The
 * non-breaking space keeps the day and the time on one line in narrow cells.
 */
export function formatClock(ms: number, now: number): string {
  const day = clockDay(ms, now);
  return day ? `${day} ${clockTime(ms)}` : clockTime(ms);
}

/** Whole minutes past a deadline, never below 1 once it is overdue. */
export function minutesLate(deadline: number, now: number): number {
  return Math.max(1, Math.floor((now - deadline) / 60000));
}

/** «32 хв» with a non-breaking space, so a narrow cell never orphans «хв». */
export function lateText(deadline: number, now: number): string {
  return `${minutesLate(deadline, now)}\u00a0хв`;
}

export const PRIORITY_VIEW: Record<
  NormPriority,
  { label: string; short: string; tier: string; tone: "critical" | "high" | "medium" }
> = {
  CRITICAL: { label: "Критичний", short: "Крит.", tier: "Критичні", tone: "critical" },
  HIGH: { label: "Високий", short: "Вис.", tier: "Високі", tone: "high" },
  MEDIUM: { label: "Нормальний", short: "Норм.", tier: "Нормальні", tone: "medium" }
};

/** All members of one filial inside a group (a filial may have several). */
export interface FilialSlice<T extends GroupableTask> {
  filialId: number;
  members: T[];
  taskIds: string[];
  quantity: number;
  readyAt: number | null;
  priority: NormPriority;
}

/** Members bucketed per filial, keeping the urgency order of `members`. */
export function sliceByFilial<T extends GroupableTask>(members: T[]): FilialSlice<T>[] {
  const slices = new Map<number, FilialSlice<T>>();
  for (const member of members) {
    let slice = slices.get(member.filial_id);
    if (!slice) {
      slice = {
        filialId: member.filial_id,
        members: [],
        taskIds: [],
        quantity: 0,
        readyAt: null,
        priority: normPriority(member.priority)
      };
      slices.set(member.filial_id, slice);
    }
    slice.members.push(member);
    slice.taskIds.push(member.id);
    slice.quantity = Math.round((slice.quantity + member.quantity) * 10) / 10;
    const ready = readyMs(member.operational_ready_at);
    if (ready != null && (slice.readyAt == null || ready < slice.readyAt)) slice.readyAt = ready;
    if (priorityRankOf(member.priority) < priorityRankOf(slice.priority)) {
      slice.priority = normPriority(member.priority);
    }
  }
  return Array.from(slices.values());
}

/** Article badges of a lane: the union over its batches. */
export function laneBadges(groups: TaskGroup<GroupableTask>[]): {
  promo: string[];
  guest: boolean;
  ecom: number;
  bakeryType: string | null;
} {
  const promo = new Set<string>();
  let guest = false;
  let ecom = 0;
  let bakeryType: string | null = null;
  for (const group of groups) {
    group.promoMechanics.forEach((mechanic) => promo.add(mechanic));
    guest ||= group.guest;
    ecom += group.ecomTotal;
    bakeryType ??= group.bakeryType;
  }
  return { promo: Array.from(promo), guest, ecom, bakeryType };
}

/** «на 3 філії» / «одна філія». */
export function filialSpreadLabel(filialIds: number[]): string {
  if (filialIds.length === 1) return "одна філія";
  return `на ${countLabel(filialIds.length, WORDS.filialAcc)}`;
}

/**
 * The grouping window of a batch, «12:09–17:09». A start that is not today
 * carries its day; an end on another day than the start names its own
 * («22:30–03:30 (завтра)»). Null for a batch without readiness.
 */
export function batchWindowText(
  group: TaskGroup<GroupableTask>,
  windowMinutes: number,
  now: number
): string | null {
  if (group.deadline == null) return null;
  const end = group.deadline + windowMinutes * 60000;
  const endDay = clockDay(end, now);
  const tail = endDay !== clockDay(group.deadline, now) ? `\u00a0(${endDay ?? "сьогодні"})` : "";
  return `${formatClock(group.deadline, now)}–${clockTime(end)}${tail}`;
}

/**
 * «остання до 16:40» under a batch's readiness, when its last order is due
 * later than the first. The day is named only when it differs from the
 * deadline's, which the cell already shows above the time.
 */
export function batchLastText(group: TaskGroup<GroupableTask>, now: number): string | null {
  if (group.members.length < 2 || group.deadline == null || group.last == null) return null;
  if (group.last <= group.deadline) return null;
  const sameDay = clockDay(group.last, now) === clockDay(group.deadline, now);
  return `остання до ${sameDay ? clockTime(group.last) : formatClock(group.last, now)}`;
}

/** Presentation filials with no order in the batch, by short name. */
export function absentFilialNames(group: TaskGroup<GroupableTask>, filialIds: number[]): string[] {
  return filialIds.filter((filialId) => !group.filialIds.includes(filialId)).map(getFilialShortName);
}

// ─── filial tiles of a batch row ───

export interface BatchTile<T extends GroupableTask> {
  slice: FilialSlice<T>;
  name: string;
  /** Orders of the filial in the batch; the «×N» chip shows from 2. */
  orders: number;
  /** The filial's own priority, only when it differs from the batch's. */
  priority: NormPriority | null;
  /**
   * «до 12:09» (the day named when not today), «−32 хв» once overdue; null
   * without readiness. `short` is the compact tile's form: a day word stands
   * in for «до» («завтра 00:43»), so the time keeps to one line.
   */
  due: { text: string; short: string; late: boolean } | null;
  ariaLabel: string;
}

/**
 * One slot per presentation filial in header order, so a filial keeps its
 * place in every row; null where the filial has no order in the batch.
 */
export function batchTiles<T extends GroupableTask>(
  group: TaskGroup<T>,
  filialIds: number[],
  now: number
): (BatchTile<T> | null)[] {
  const slices = new Map(sliceByFilial(group.members).map((slice) => [slice.filialId, slice]));
  return filialIds.map((filialId) => {
    const slice = slices.get(filialId);
    if (!slice) return null;
    const name = getFilialShortName(filialId);
    const orders = slice.members.length;
    const priority = slice.priority !== group.priority ? slice.priority : null;
    const facts = [`${formatQty(slice.quantity)} ${group.unit}`];
    let due: BatchTile<T>["due"] = null;
    if (slice.readyAt == null) {
      facts.push("без часу готовності");
    } else {
      const clock = formatClock(slice.readyAt, now);
      facts.push(`до ${clock}`);
      if (slice.readyAt < now) {
        facts.push(`прострочено ${lateText(slice.readyAt, now)}`);
        const late = `−${lateText(slice.readyAt, now)}`;
        due = { text: late, short: late, late: true };
      } else {
        const short = clockDay(slice.readyAt, now) ? clock : `до ${clock}`;
        due = { text: `до ${clock}`, short, late: false };
      }
    }
    if (priority) facts.push(`пріоритет ${PRIORITY_VIEW[priority].label.toLowerCase()}`);
    if (orders > 1) facts.push(countLabel(orders, WORDS.order));
    return {
      slice,
      name,
      orders,
      priority,
      due,
      ariaLabel: `${name}: ${facts.join(", ")}. Дії для філії`
    };
  });
}

/** «Березнева · 1,5 кг»: the popover title and the slice's action labels. */
export function sliceLabel(slice: FilialSlice<GroupableTask>, unit: Unit): string {
  return `${getFilialShortName(slice.filialId)} · ${formatQty(slice.quantity)} ${unit}`;
}

/** Shelf stock of a slice: its members share one shelf, so the first known value counts. */
export function shelfStockText(stocks: (number | null)[], unit: Unit): string {
  const known = stocks.find((stock) => stock != null);
  return known != null ? `${formatQty(known)} ${unit}` : "невідомий";
}

/** The orders of one filial in a batch, earliest first: «до 15:09» · «9 шт». */
export function sliceOrders(
  slice: FilialSlice<GroupableTask>,
  unit: Unit,
  now: number
): { id: string; due: string; quantity: string }[] {
  return slice.members
    .map((member) => ({ member, ready: readyMs(member.operational_ready_at) }))
    .sort((a, b) => byDeadline(a.ready, b.ready))
    .map(({ member, ready }) => ({
      id: member.id,
      due: ready != null ? `до ${formatClock(ready, now)}` : "без часу",
      quantity: `${formatQty(member.quantity)} ${unit}`
    }));
}

/**
 * Row names of the completion modal. A filial with several orders among the
 * members names each row by its readiness: «Березнева · до 15:09».
 */
export function memberLabels(members: GroupableTask[], now: number): string[] {
  const orders = new Map<number, number>();
  members.forEach((member) => orders.set(member.filial_id, (orders.get(member.filial_id) ?? 0) + 1));
  return members.map((member) => {
    const name = getFilialShortName(member.filial_id);
    if ((orders.get(member.filial_id) ?? 0) < 2) return name;
    const ready = readyMs(member.operational_ready_at);
    return `${name} · ${ready != null ? `до ${formatClock(ready, now)}` : "без часу"}`;
  });
}

export function scopeEyebrow(
  filialCount: number,
  windowMinutes: number,
  groups: TaskGroup<GroupableTask>[]
): string {
  const tasks = groups.reduce((sum, group) => sum + group.members.length, 0);
  return [
    "Представлення",
    countLabel(filialCount, WORDS.filial),
    `групування ${formatWindowHours(windowMinutes)}`,
    `${countLabel(groups.length, WORDS.batch)} / ${countLabel(tasks, WORDS.task)}`
  ].join(" · ");
}

interface QtyPart {
  filialId: number;
  quantity: number;
}

function filialParts(parts: QtyPart[]): string {
  return parts.map((part) => `${getFilialShortName(part.filialId)} ${formatQty(part.quantity)}`).join(" · ");
}

/** «Почато: Круасан · Березнева 24 · Січових Стрільців 18 (1 уже взяли на іншому планшеті)». */
export function startedToastText(lagerName: string, parts: QtyPart[], skipped: number): string {
  const text = `Почато: ${lagerName} · ${filialParts(parts)}`;
  return skipped > 0 ? `${text} (${skipped} уже взяли на іншому планшеті)` : text;
}

/** «Виконано: Круасан · Березнева 24 · … → у вкладці «Виконані»». */
export function completedToastText(lagerName: string, parts: QtyPart[]): string {
  return `Виконано: ${lagerName} · ${filialParts(parts)} → у вкладці «Виконані»`;
}

/** Sums produced quantities per filial, in the order filials first appear. */
export function producedByFilial(
  members: GroupableTask[],
  produced: number[]
): QtyPart[] {
  const byFilial = new Map<number, number>();
  members.forEach((member, index) => {
    const value = produced[index] ?? 0;
    if (value <= 0) return;
    byFilial.set(member.filial_id, Math.round(((byFilial.get(member.filial_id) ?? 0) + value) * 10) / 10);
  });
  return Array.from(byFilial, ([filialId, quantity]) => ({ filialId, quantity }));
}

// ─── grid layouts ───

export interface GridLayout {
  columns: string;
  gap: number;
  /** The columns cannot fit a 1340 px tablet: the prep sheet scrolls sideways. */
  wide: boolean;
}

export interface SheetLayout {
  /** Header and rows: readiness · filial tiles · Σ · actions. */
  columns: string;
  /** Tile slots, shared by the header chips; from 7 filials they wrap onto more lines. */
  tiles: string;
  /**
   * 4+ filials: narrower side columns, two-line tile names and the readiness
   * on its own line. At 4 the standard 17 px names already wrap in a 160 px
   * tile and push rows to ~140–160 px; compact keeps them at ~121.
   */
  compact: boolean;
}

/** Batch sheet grid; fits the 1284 px content width of a 1340 px tablet for any filial count. */
export function sheetLayout(filialCount: number): SheetLayout {
  const compact = filialCount >= 4;
  return {
    columns: compact ? "150px minmax(0, 1fr) 120px 224px" : "176px minmax(0, 1fr) 136px 232px",
    tiles:
      filialCount >= 7
        ? "repeat(auto-fill, minmax(112px, 1fr))"
        : `repeat(${Math.max(1, filialCount)}, minmax(0, 1fr))`,
    compact
  };
}

/** Prep sheet columns: article · one per filial · Σ · batch chips. */
export function prepLayout(filialCount: number): GridLayout {
  if (filialCount <= 4) {
    return {
      columns: `minmax(240px, 1fr) repeat(${filialCount}, 110px) 140px minmax(220px, 300px)`,
      gap: 12,
      wide: false
    };
  }
  return {
    columns: `minmax(220px, 1fr) repeat(${filialCount}, 100px) 140px minmax(220px, 300px)`,
    gap: 8,
    wide: filialCount > 6
  };
}

// ─── prep sheet («Заготовки») ───

/** «Не включено 1 партію «В роботі» — її вже готують.» / «… 3 партії … — їх уже готують.» */
export function prepInProgressNote(count: number): string {
  const pronoun = count === 1 ? "її вже" : "їх уже";
  return `Не включено ${countLabel(count, WORDS.batchAcc)} «В роботі» — ${pronoun} готують.`;
}

export interface PrepChip {
  key: string;
  deadline: number | null;
  total: number;
  priority: NormPriority;
}

export interface PrepRow {
  key: string;
  lagerId: number;
  lagerName: string;
  unit: Unit;
  perFilial: Record<number, number>;
  total: number;
  chips: PrepChip[];
}

export interface PrepSection {
  key: string;
  title: string;
  rows: PrepRow[];
  pcs: number;
  kg: number;
}

export interface PrepSheet {
  sections: PrepSection[];
  perFilial: Record<number, { pcs: number; kg: number }>;
  pcs: number;
  kg: number;
}

const NO_TYPE = "Без типу";

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function sectionOrder(title: string): number {
  if (title === NO_TYPE) return BAKERY_TYPES.length + 1;
  const index = (BAKERY_TYPES as readonly string[]).indexOf(title);
  return index === -1 ? BAKERY_TYPES.length : index;
}

function byDeadline(a: number | null, b: number | null): number {
  if (a == null) return b == null ? 0 : 1;
  if (b == null) return -1;
  return a - b;
}

/**
 * What the kitchen needs for the NEW batches in scope: one row per article
 * (lager + unit) with per-filial sums, grouped by bakery type. `horizonEnd`
 * keeps only batches whose deadline is at or before it (null = all).
 */
export function buildPrepSheet(
  groups: TaskGroup<GroupableTask>[],
  horizonEnd: number | null
): PrepSheet {
  const rows = new Map<string, PrepRow & { bakeryType: string | null }>();
  for (const group of groups) {
    if (group.status !== "NEW") continue;
    if (horizonEnd != null && (group.deadline == null || group.deadline > horizonEnd)) continue;
    const key = `${group.lagerId}:${group.unit}`;
    let row = rows.get(key);
    if (!row) {
      row = {
        key,
        lagerId: group.lagerId,
        lagerName: group.lagerName,
        unit: group.unit,
        perFilial: {},
        total: 0,
        chips: [],
        bakeryType: group.bakeryType
      };
      rows.set(key, row);
    }
    row.bakeryType ??= group.bakeryType;
    for (const member of group.members) {
      row.perFilial[member.filial_id] = round1((row.perFilial[member.filial_id] ?? 0) + member.quantity);
    }
    row.total = round1(row.total + group.total);
    row.chips.push({ key: group.key, deadline: group.deadline, total: group.total, priority: group.priority });
  }

  const sections = new Map<string, PrepSection>();
  const perFilial: PrepSheet["perFilial"] = {};
  let pcs = 0;
  let kg = 0;
  for (const { bakeryType, ...row } of rows.values()) {
    row.chips.sort((a, b) => byDeadline(a.deadline, b.deadline) || a.key.localeCompare(b.key));
    const title = bakeryType ?? NO_TYPE;
    let section = sections.get(title);
    if (!section) {
      section = { key: title, title, rows: [], pcs: 0, kg: 0 };
      sections.set(title, section);
    }
    section.rows.push(row);
    if (row.unit === "шт") {
      section.pcs = round1(section.pcs + row.total);
      pcs = round1(pcs + row.total);
    } else {
      section.kg = round1(section.kg + row.total);
      kg = round1(kg + row.total);
    }
    for (const [filial, quantity] of Object.entries(row.perFilial)) {
      const totals = (perFilial[Number(filial)] ??= { pcs: 0, kg: 0 });
      if (row.unit === "шт") totals.pcs = round1(totals.pcs + quantity);
      else totals.kg = round1(totals.kg + quantity);
    }
  }

  const ordered = Array.from(sections.values()).sort(
    (a, b) => sectionOrder(a.title) - sectionOrder(b.title) || a.title.localeCompare(b.title, "uk")
  );
  for (const section of ordered) {
    section.rows.sort(
      (a, b) =>
        byDeadline(a.chips[0]?.deadline ?? null, b.chips[0]?.deadline ?? null) ||
        a.lagerName.localeCompare(b.lagerName, "uk") ||
        a.key.localeCompare(b.key)
    );
  }
  return { sections: ordered, perFilial, pcs, kg };
}

// ─── group completion («Скільки виготовлено?») ───

export interface CompleteState {
  unit: Unit;
  /** Ordered quantity per member, urgency order. */
  ordered: number[];
  total: string;
  rows: string[];
  target: "total" | number;
  /** False right after (re)targeting: the next key replaces the value. */
  typed: boolean;
  /** A row was edited by hand; «Разом» then shows the row sum. */
  manual: boolean;
}

export type CompleteAction =
  | { type: "digit"; digit: string }
  | { type: "comma" }
  | { type: "backspace" }
  | { type: "clear" }
  | { type: "step"; direction: 1 | -1 }
  | { type: "target"; target: "total" | number }
  | { type: "auto" };

function distributed(total: number, state: Pick<CompleteState, "ordered" | "unit">): string[] {
  return distributeProduced(total, state.ordered, state.unit).map(formatQuantity);
}

export function rowSum(state: Pick<CompleteState, "rows">): number {
  return round1(state.rows.reduce((sum, row) => sum + parseQuantity(row), 0));
}

export function initialCompleteState(ordered: number[], unit: Unit): CompleteState {
  const total = round1(ordered.reduce((sum, quantity) => sum + quantity, 0));
  return {
    unit,
    ordered,
    total: formatQuantity(total),
    rows: ordered.map(formatQuantity),
    target: "total",
    typed: false,
    manual: false
  };
}

/** What «Разом» shows: the entered total, or the row sum after manual edits. */
export function displayedTotal(state: CompleteState): string {
  return state.manual ? formatQuantity(rowSum(state)) : state.total;
}

function currentValue(state: CompleteState): string {
  return state.target === "total" ? state.total : (state.rows[state.target] ?? "0");
}

function withValue(state: CompleteState, value: string, typed: boolean): CompleteState {
  if (state.target === "total") {
    return { ...state, total: value, rows: distributed(parseQuantity(value), state), manual: false, typed };
  }
  const rows = state.rows.slice();
  rows[state.target] = value;
  return { ...state, rows, manual: true, typed };
}

export function completeReducer(state: CompleteState, action: CompleteAction): CompleteState {
  const current = currentValue(state);
  const base = state.typed ? current : clearValue();
  switch (action.type) {
    case "digit":
      return withValue(state, appendDigit(base, action.digit, state.unit), true);
    case "comma":
      return withValue(state, appendComma(base, state.unit), true);
    case "backspace":
      return withValue(state, backspaceValue(current), true);
    case "clear":
      return withValue(state, clearValue(), false);
    case "step":
      return withValue(state, stepValue(current, action.direction, state.unit), false);
    case "target":
      if (action.target === "total") {
        // Continue from the visible row sum, not from a stale total.
        const total = state.manual ? formatQuantity(rowSum(state)) : state.total;
        return { ...state, total, target: "total", typed: false };
      }
      return { ...state, target: action.target, typed: false };
    case "auto": {
      const sum = rowSum(state);
      return {
        ...state,
        total: formatQuantity(sum),
        rows: distributed(sum, state),
        target: "total",
        typed: false,
        manual: false
      };
    }
    default:
      return state;
  }
}

export interface DistributionHint {
  tone: "warn" | "info";
  text: string;
}

/** The hint box under the per-filial distribution. */
export function distributionHint(state: CompleteState, names: string[]): DistributionHint {
  const unit = state.unit;
  const produced = state.rows.map(parseQuantity);
  const sum = rowSum(state);
  const ordered = round1(state.ordered.reduce((acc, quantity) => acc + quantity, 0));
  if (sum <= 0) {
    return {
      tone: "warn",
      text: "Введіть кількість — 0 підтвердити не можна. Якщо не вийшло виготовити, скористайтесь «Неможливо виготовити»."
    };
  }
  if (state.manual) {
    return {
      tone: "info",
      text: `Ручний розподіл: разом = сума рядків (${formatQty(sum)} ${unit}). Зміна поля «Разом» знову розподілить автоматично.`
    };
  }
  if (Math.round(sum * 10) < Math.round(ordered * 10)) {
    const short = Array.from(
      new Set(names.filter((_, index) => Math.round(produced[index] * 10) < Math.round(state.ordered[index] * 10)))
    );
    const one = short.length === 1;
    return {
      tone: "warn",
      text: `Нестача ${formatQty(ordered - sum)} ${unit} — ${one ? "недоотримає" : "недоотримають"} ${short.join(", ")} (найменш ${one ? "термінова" : "термінові"})`
    };
  }
  if (Math.round(sum * 10) > Math.round(ordered * 10)) {
    const plus = names
      .map((name, index) => ({ name, delta: round1(produced[index] - state.ordered[index]) }))
      .filter((part) => part.delta > 0)
      .map((part) => `${part.name} +${formatQty(part.delta)}`);
    return { tone: "info", text: `Надлишок +${formatQty(sum - ordered)} ${unit}: ${plus.join(" · ")}` };
  }
  return { tone: "info", text: "Розподілено як у замовленні — підтвердіть одним тапом." };
}

/** Delta pill of a distribution row. */
export function deltaLabel(produced: number, ordered: number): { tone: "eq" | "minus" | "plus"; text: string } {
  const delta = round1(produced - ordered);
  if (delta === 0) return { tone: "eq", text: "як замовлено" };
  if (delta < 0) return { tone: "minus", text: `−${formatQty(-delta)}` };
  return { tone: "plus", text: `+${formatQty(delta)}` };
}
