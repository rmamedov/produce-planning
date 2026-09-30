// Pure view logic of the kitchen presentation view (labels, layouts, the
// prep sheet and the group-completion input). Unit-tested in
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

export const WORDS: Record<"batch" | "batchAcc" | "task" | "filial" | "filialAcc" | "position", Forms> = {
  batch: ["партія", "партії", "партій"],
  batchAcc: ["партію", "партії", "партій"],
  task: ["задача", "задачі", "задач"],
  filial: ["філія", "філії", "філій"],
  filialAcc: ["філію", "філії", "філій"],
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

/** «на 3 філії» / «лише Березнева». */
export function filialSpreadLabel(filialIds: number[]): string {
  if (filialIds.length === 1) return `лише ${getFilialShortName(filialIds[0])}`;
  return `на ${countLabel(filialIds.length, WORDS.filialAcc)}`;
}

/**
 * Second line of the batch status column. The window start sits under the
 * deadline column's day line; the end names its own day when it is not today.
 */
export function batchStatusLine(
  group: TaskGroup<GroupableTask>,
  windowMinutes: number,
  now: number
): string {
  const parts: string[] = [];
  if (group.kind === "window" && group.deadline != null) {
    const end = group.deadline + windowMinutes * 60000;
    const endDay = clockDay(end, now);
    parts.push(`вікно ${clockTime(group.deadline)}–${clockTime(end)}${endDay ? ` (${endDay})` : ""}`);
  } else if (group.kind === "no_time") {
    parts.push("без часу готовності");
  }
  parts.push(countLabel(group.filialIds.length, WORDS.filial));
  return parts.join(" · ");
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
  /** The columns cannot fit a 1340 px tablet: the sheet scrolls sideways. */
  wide: boolean;
}

/**
 * Batch sheet columns: deadline · status · one column per filial · Σ · actions.
 * 5–6 filials narrow the filial columns (and the flexible ones) so the sheet
 * still fits the 1284 px content width of a 1340 px tablet.
 */
export function sheetLayout(filialCount: number): GridLayout {
  if (filialCount <= 4) {
    return { columns: `140px minmax(200px, 1fr) repeat(${filialCount}, 120px) 150px 216px`, gap: 12, wide: false };
  }
  if (filialCount === 5) {
    return { columns: "140px minmax(176px, 1fr) repeat(5, 100px) 150px 216px", gap: 8, wide: false };
  }
  return {
    columns: `120px minmax(100px, 1fr) repeat(${filialCount}, 100px) 120px 216px`,
    gap: 8,
    wide: filialCount > 6
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
