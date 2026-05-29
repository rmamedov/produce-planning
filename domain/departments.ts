// Department reference (API V2). Maps department_id -> human-readable name.
export const DEPARTMENT_NAMES: Record<number, string> = {
  8: "М'ясний відділ",
  11: "Рибний відділ",
  13: "Кулінарія",
  17: "Хлібобулочні вироби"
};

export function getDepartmentName(departmentId: number | null | undefined): string | null {
  if (departmentId == null) {
    return null;
  }
  return DEPARTMENT_NAMES[departmentId] ?? null;
}
