// Filial (branch) display names. Falls back to "Філія {id}" when unknown.
export const FILIAL_NAMES: Record<number, string> = {
  3361: "Березнева (3361)",
  2048: "Січових Стрільців (2048)",
  2043: "Дніпровська Наб. 33 (2043)"
};

export function getFilialName(filialId: number): string {
  return FILIAL_NAMES[filialId] ?? `Філія ${filialId}`;
}

/** Name without the "(id)" suffix — for narrow places like sheet column headers. */
export function getFilialShortName(filialId: number): string {
  const full = FILIAL_NAMES[filialId];
  return full ? full.replace(/\s*\(\d+\)\s*$/, "") : `Філія ${filialId}`;
}
