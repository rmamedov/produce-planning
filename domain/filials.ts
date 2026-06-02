// Filial (branch) display names. Falls back to "Філія {id}" when unknown.
export const FILIAL_NAMES: Record<number, string> = {
  3361: "Березнева (3361)",
  2048: "Січових Стрільців (2048)",
  2043: "Дніпровська Наб. 33"
};

export function getFilialName(filialId: number): string {
  return FILIAL_NAMES[filialId] ?? `Філія ${filialId}`;
}
