// Pure helpers for the kitchen board filters — extracted so they can be
// unit-tested (see tests/kitchen-filters.test.ts).

export const DEFAULT_FILIAL_ID = 3361;
export const DEFAULT_DEPARTMENT_ID = 17;

// Quick date options. Values are semantic tokens (not concrete dates) so a
// persisted "today" still means the current day after tomorrow's reload.
export const DATE_QUICK_OPTIONS = [
  { label: "Усі дати", value: "all" },
  { label: "Вчора", value: "yesterday" },
  { label: "Сьогодні", value: "today" },
  { label: "Завтра", value: "tomorrow" },
  { label: "Післязавтра", value: "aftertomorrow" }
] as const;

const TOKEN_OFFSETS: Record<string, number> = {
  yesterday: -1,
  today: 0,
  tomorrow: 1,
  aftertomorrow: 2
};

export function localDateStr(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

// Local-time YYYY-MM-DD for `offset` days from `from` (defaults to today).
export function isoDateOffset(offset: number, from: Date = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() + offset);
  return localDateStr(d);
}

export function isConcreteDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/**
 * Resolves a stored date-filter value ("all", a semantic token, or a concrete
 * YYYY-MM-DD) to "all" or a concrete date, evaluated against `now`.
 * Unknown values fall back to "all".
 */
export function resolveDateFilter(value: string, now: Date = new Date()): string {
  if (value in TOKEN_OFFSETS) return isoDateOffset(TOKEN_OFFSETS[value], now);
  if (isConcreteDate(value)) return value;
  return "all";
}

export function dateFilterLabel(value: string): string {
  const quick = DATE_QUICK_OPTIONS.find((option) => option.value === value);
  if (quick) return quick.label;
  if (isConcreteDate(value)) {
    const [y, m, d] = value.split("-");
    return `${d}.${m}.${y}`;
  }
  return "Усі дати";
}

function isPositiveIntString(value: string): boolean {
  const n = Number(value);
  return Number.isInteger(n) && n > 0;
}

/**
 * Picks the branch to show on the board (there is no "all branches" option):
 *  - the operator's stored choice, when it's a concrete filial id;
 *  - otherwise, once options are loaded: the default filial (3361) when it
 *    has tasks, else the first filial that does, else the default anyway.
 * Returns null while options are not loaded yet and there is no stored choice.
 */
export function resolveBranchSelection(
  stored: string | null,
  availableIds: number[],
  loaded: boolean
): string | null {
  if (stored && stored !== "all" && isPositiveIntString(stored)) return stored;
  if (!loaded) return null;
  const sorted = [...availableIds].sort((a, b) => a - b);
  if (sorted.includes(DEFAULT_FILIAL_ID)) return String(DEFAULT_FILIAL_ID);
  if (sorted.length > 0) return String(sorted[0]);
  return String(DEFAULT_FILIAL_ID);
}

/**
 * Department default: the stored choice ("all" is a valid stored choice),
 * otherwise Пекарня (17).
 */
export function resolveDepartmentSelection(stored: string | null): string {
  return stored ?? String(DEFAULT_DEPARTMENT_ID);
}
