"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, Layers, Store } from "lucide-react";

import { getFilialName, getFilialShortName } from "@/domain/filials";
import { isPresentationScope, presentationScopeValue } from "@/lib/kitchen-filters";
import { countBatches, plural } from "@/lib/presentation-grouping";
import styles from "../production-kitchen-board.module.css";
import type { KitchenTask, Presentation } from "../types";

const BATCH_FORMS: [string, string, string] = ["партія", "партії", "партій"];
const TASK_FORMS: [string, string, string] = ["задача", "задачі", "задач"];

function formatHours(hours: number) {
  return String(hours).replace(".", ",");
}

/**
 * The board scope field: a single filial or a presentation (several filials
 * grouped into batches). Replaces the «Філія» select.
 */
export function ScopePicker({
  value,
  presentations,
  filialIds,
  tasks,
  onChange
}: {
  /** Filial id ("3361") or presentation scope ("p:<id>"). */
  value: string;
  presentations: Presentation[];
  filialIds: number[];
  /** Active tasks in the current department/date scope — the source of the counters. */
  tasks: KitchenTask[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open]);

  const presentationMode = isPresentationScope(value);
  const selectedPresentation = presentationMode
    ? presentations.find((presentation) => presentationScopeValue(presentation.id) === value) ?? null
    : null;

  const presentationRows = useMemo(() => {
    if (!open) return [];
    return presentations.map((presentation) => {
      const ids = new Set(presentation.filial_ids);
      return {
        presentation,
        batches: countBatches(
          tasks.filter((task) => ids.has(task.filial_id)),
          presentation.window_minutes
        )
      };
    });
  }, [open, presentations, tasks]);

  const filialRows = useMemo(() => {
    if (!open) return [];
    const counts = new Map<number, number>();
    for (const task of tasks) counts.set(task.filial_id, (counts.get(task.filial_id) ?? 0) + 1);
    return filialIds.map((id) => ({ id, tasks: counts.get(id) ?? 0 }));
  }, [open, filialIds, tasks]);

  const pick = (next: string) => {
    setOpen(false);
    if (next !== value) onChange(next);
  };

  const fieldClass = presentationMode
    ? `${styles.field} ${styles.scopeField} ${styles.scopeFieldPresentation}`
    : `${styles.field} ${styles.scopeField}`;

  return (
    <div className={styles.scopeWrap}>
      <button
        type="button"
        className={fieldClass}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {presentationMode ? (
          <span className={styles.scopeFieldIcon} aria-hidden>
            <Layers size={18} strokeWidth={2} />
          </span>
        ) : null}
        <span className={styles.fieldLabel}>{presentationMode ? "Представлення" : "Філія"}</span>
        <span className={styles.scopeValue}>
          {presentationMode ? selectedPresentation?.name ?? "…" : getFilialName(Number(value))}
        </span>
        <span className={styles.fieldChevron}>
          <ChevronDown size={16} strokeWidth={2.2} />
        </span>
      </button>

      {open ? (
        <>
          <div className={styles.menuBackdrop} onClick={() => setOpen(false)} />
          <div className={styles.scopePopover} role="listbox" aria-label="Філія або представлення">
            {presentationRows.length ? (
              <>
                <p className={styles.scopeSection}>Представлення</p>
                {presentationRows.map(({ presentation, batches }) => {
                  const scope = presentationScopeValue(presentation.id);
                  const selected = scope === value;
                  return (
                    <button
                      key={presentation.id}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      className={selected ? styles.scopeRowActive : styles.scopeRow}
                      onClick={() => pick(scope)}
                    >
                      <span className={styles.scopeTile} aria-hidden>
                        <Layers size={22} strokeWidth={2} />
                      </span>
                      <span className={styles.scopeText}>
                        <span className={styles.scopeName}>{presentation.name}</span>
                        <span className={styles.scopeMeta}>
                          {presentation.filial_ids.map(getFilialShortName).join(" · ")}
                        </span>
                      </span>
                      <span className={styles.scopePill}>{formatHours(presentation.window_hours)} год</span>
                      <span className={batches ? styles.scopePill : styles.scopePillMuted}>
                        {batches ? `${batches} ${plural(batches, BATCH_FORMS)}` : "немає задач"}
                      </span>
                      <span className={styles.scopeCheck} aria-hidden>
                        {selected ? <Check size={22} strokeWidth={3} /> : null}
                      </span>
                    </button>
                  );
                })}
                <div className={styles.scopeDivider} />
              </>
            ) : null}

            <p className={styles.scopeSection}>Філії</p>
            {filialRows.map(({ id, tasks: count }) => {
              const scope = String(id);
              const selected = scope === value;
              return (
                <button
                  key={id}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={`${selected ? styles.scopeRowActive : styles.scopeRow} ${styles.scopeRowFilial}`}
                  onClick={() => pick(scope)}
                >
                  <span className={styles.scopeTileFilial} aria-hidden>
                    <Store size={20} strokeWidth={2} />
                  </span>
                  <span className={styles.scopeText}>
                    <span className={styles.scopeNameFilial}>{getFilialName(id)}</span>
                  </span>
                  <span className={count ? styles.scopePill : styles.scopePillMuted}>
                    {count ? `${count} ${plural(count, TASK_FORMS)}` : "немає задач"}
                  </span>
                  <span className={styles.scopeCheck} aria-hidden>
                    {selected ? <Check size={22} strokeWidth={3} /> : null}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      ) : null}
    </div>
  );
}
