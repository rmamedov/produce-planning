"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";

import { getFilialName, getFilialShortName } from "@/domain/filials";
import { apiClient } from "@/hooks/use-api";
import { plural } from "@/lib/presentation-grouping";
import {
  documentFailureInfo,
  documentQuantity,
  documentTotals,
  stopsDocumentRun,
  transferToastMessage
} from "@/lib/task-documenting";
import styles from "../production-kitchen-board.module.css";
import type { KitchenTask, Presentation, TransferDocumentResponse } from "../types";

const TASK_FORMS: [string, string, string] = ["задача", "задачі", "задач"];
const DOC_FORMS: [string, string, string] = ["документ", "документи", "документів"];

interface FilialSection {
  filialId: number;
  rows: KitchenTask[];
  selected: KitchenTask[];
  pcs: number;
  kg: number;
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

// "HH:mm" for today, "dd.MM HH:mm" otherwise.
function formatTime(iso: string) {
  const date = new Date(iso);
  const hhmm = `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
  const today = new Date();
  const sameDay =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();
  return sameDay ? hhmm : `${pad2(date.getDate())}.${pad2(date.getMonth() + 1)} ${hhmm}`;
}

function formatNumber(value: number) {
  return String(Math.round(value * 100) / 100).replace(".", ",");
}

/** Pieces and kilograms are never summed together. */
function formatQtyPair(pcs: number, kg: number) {
  const parts = [pcs ? `${formatNumber(pcs)} шт` : "", kg ? `${formatNumber(kg)} кг` : ""].filter(Boolean);
  return parts.length ? parts.join(" + ") : "0";
}

function countLabel(count: number, forms: [string, string, string]) {
  return `${count} ${plural(count, forms)}`;
}

/**
 * «Виконані» in presentation mode. A Рубікон document belongs to exactly one
 * filial, so every filial gets its own section, selection and button.
 * Selection is owned by the board (it survives switching tabs): the board
 * stores the DESELECTED ids, so newly completed tasks arrive checked.
 */
export function PresentationDone({
  presentation,
  tasks,
  deselected,
  onDeselectedChange,
  onChanged
}: {
  presentation: Presentation;
  /** Undocumented DONE tasks of the presentation filials (department filter applied). */
  tasks: KitchenTask[];
  deselected: Set<string>;
  onDeselectedChange: (next: Set<string>) => void;
  /** Refetches the task lists; resolves once the fresh data has landed. */
  onChanged: () => Promise<unknown>;
}) {
  const [busy, setBusy] = useState<Set<number>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);

  const sections = useMemo<FilialSection[]>(() => {
    const byFilial = new Map<number, KitchenTask[]>();
    for (const task of tasks) {
      const rows = byFilial.get(task.filial_id);
      if (rows) rows.push(task);
      else byFilial.set(task.filial_id, [task]);
    }
    const extra = Array.from(byFilial.keys())
      .filter((id) => !presentation.filial_ids.includes(id))
      .sort((a, b) => a - b);
    return [...presentation.filial_ids, ...extra]
      .filter((id) => byFilial.has(id))
      .map((filialId) => {
        const rows = [...(byFilial.get(filialId) ?? [])].sort((a, b) =>
          (a.completed_at ?? "").localeCompare(b.completed_at ?? "")
        );
        const selected = rows.filter((task) => !deselected.has(task.id));
        const totals = documentTotals(selected);
        return { filialId, rows, selected, pcs: totals.pcs, kg: totals.kg };
      });
  }, [tasks, presentation.filial_ids, deselected]);

  // A batch is "shared" when a completed task of ANOTHER filial still in the
  // tab carries the same batch_id (same-filial duplicates don't count).
  const sharedBatches = useMemo(() => {
    const filialsByBatch = new Map<string, Set<number>>();
    for (const task of tasks) {
      if (!task.batch_id) continue;
      const filials = filialsByBatch.get(task.batch_id);
      if (filials) filials.add(task.filial_id);
      else filialsByBatch.set(task.batch_id, new Set([task.filial_id]));
    }
    return new Set(
      Array.from(filialsByBatch)
        .filter(([, filials]) => filials.size > 1)
        .map(([id]) => id)
    );
  }, [tasks]);

  const pending = sections.filter((section) => section.selected.length > 0);
  const anyBusy = busy.size > 0;

  const toggleTask = (id: string) => {
    const next = new Set(deselected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onDeselectedChange(next);
  };

  const toggleSection = (section: FilialSection) => {
    const next = new Set(deselected);
    const allSelected = section.selected.length === section.rows.length;
    for (const task of section.rows) {
      if (allSelected) next.add(task.id);
      else next.delete(task.id);
    }
    onDeselectedChange(next);
  };

  const unbusy = (filialIds: number[]) =>
    setBusy((current) => {
      const next = new Set(current);
      for (const id of filialIds) next.delete(id);
      return next;
    });

  // Sequential on purpose: one transfer per filial, and a failure of one
  // filial must not hide the documents that did go through.
  const documentSections = async (targets: FilialSection[]) => {
    setConfirmOpen(false);
    if (!targets.length) return;
    setBusy(new Set(targets.map((section) => section.filialId)));
    const created: { filialId: number; transferIds: string[] }[] = [];
    const failures: string[] = [];
    let delivered = true;

    for (const [index, section] of targets.entries()) {
      try {
        const response = await apiClient<TransferDocumentResponse>("/api/production-tasks/document", {
          method: "POST",
          body: JSON.stringify({
            task_ids: section.selected.map((task) => task.id),
            presentation_id: presentation.id
          })
        });
        if (response.transfer_ids.length) {
          created.push({ filialId: section.filialId, transferIds: response.transfer_ids });
          delivered &&= response.delivered;
        }
      } catch (error) {
        const failure = documentFailureInfo(error);
        failures.push(`${getFilialShortName(section.filialId)}: ${failure.message}`);
        if (failure.transferIds.length) {
          // Earlier date groups went through: those rows leave with the refetch.
          created.push({ filialId: section.filialId, transferIds: failure.transferIds });
          delivered &&= failure.delivered;
        } else {
          // Nothing of this filial was documented, so it is free to retry right away.
          unbusy([section.filialId]);
        }
        if (stopsDocumentRun(failure.code)) {
          const rest = targets.slice(index + 1);
          if (rest.length) {
            failures.push(
              `Не надсилали: ${rest.map((item) => getFilialShortName(item.filialId)).join(", ")} — спробуйте пізніше`
            );
            unbusy(rest.map((item) => item.filialId));
          }
          break;
        }
      }
    }

    const message = transferToastMessage(created.flatMap((item) => item.transferIds), delivered);
    if (message && created.length === 1 && targets.length === 1) {
      toast.success(`${getFilialShortName(created[0].filialId)}: ${message}`);
    } else if (message) {
      toast.success(message);
    } else if (!failures.length) {
      toast("Ці задачі вже оформили на іншому планшеті");
    }
    if (failures.length) toast.error(failures.join("\n"));
    // Documented sections stay busy until the refetch has removed their rows.
    try {
      await onChanged();
    } finally {
      setBusy(new Set());
    }
  };

  return (
    <>
      <div className={styles.presDoneTop}>
        <div>
          <p className={styles.presEyebrow}>Представлення · виконані</p>
          <h2 className={styles.presTitle}>{presentation.name}</h2>
        </div>
        {pending.length ? (
          <div className={styles.presDoneAll}>
            <button
              type="button"
              className={styles.presDoneAllBtn}
              disabled={anyBusy}
              onClick={() => setConfirmOpen(true)}
            >
              Оформити всі · {countLabel(pending.length, DOC_FORMS)}
            </button>
            <p className={styles.presDoneAllNote}>Кожна філія — окремий трансфер у Рубікон + дані аналітикам</p>
          </div>
        ) : null}
      </div>

      {sections.length ? null : (
        <div className={styles.stateBox}>
          <div className={styles.stateIconDone}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </div>
          <h2 className={styles.stateTitle}>Всі виконані задачі оформлені</h2>
          <p className={styles.stateText}>
            Коли кухар завершить наступну партію, її філії зʼявляться тут і чекатимуть на оформлення
            документа.
          </p>
        </div>
      )}

      {sections.map((section) => {
        const allSelected = section.selected.length === section.rows.length;
        const sectionBusy = busy.has(section.filialId);
        return (
          <section key={section.filialId} className={styles.presDoneSection} aria-label={getFilialName(section.filialId)}>
            <div className={styles.presDoneHead}>
              <div>
                <h3 className={styles.presDoneName}>{getFilialName(section.filialId)}</h3>
                <p className={styles.presDoneSummary}>
                  Вибрано {section.selected.length} із {section.rows.length}
                  {section.selected.length ? ` · ${formatQtyPair(section.pcs, section.kg)}` : ""}
                </p>
              </div>
              <div className={styles.presDoneActions}>
                <button
                  type="button"
                  className={styles.presDoneToggle}
                  disabled={sectionBusy}
                  onClick={() => toggleSection(section)}
                >
                  {allSelected ? "Зняти вибір" : "Вибрати всі"}
                </button>
                <button
                  type="button"
                  className={styles.presDoneDocBtn}
                  disabled={anyBusy || section.selected.length === 0}
                  onClick={() => void documentSections([section])}
                >
                  {sectionBusy ? "Формується…" : `Оформити документ (${section.selected.length})`}
                </button>
              </div>
            </div>

            {section.rows.map((task) => {
              const checked = !deselected.has(task.id);
              const made = documentQuantity(task);
              const differs = task.produced_qty != null && task.produced_qty !== task.quantity;
              const shared = task.batch_id != null && sharedBatches.has(task.batch_id);
              return (
                <div
                  key={task.id}
                  role="checkbox"
                  aria-checked={checked}
                  tabIndex={0}
                  className={checked ? styles.presDoneRow : styles.presDoneRowOff}
                  onClick={() => toggleTask(task.id)}
                  onKeyDown={(event) => {
                    if (event.key === " " || event.key === "Enter") {
                      event.preventDefault();
                      toggleTask(task.id);
                    }
                  }}
                >
                  <span className={styles.doneCb} aria-hidden>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                  </span>
                  <div className={styles.doneMain}>
                    <p className={styles.doneTitle}>{task.lager_name ?? `Lager ${task.lager_id}`}</p>
                    <p className={styles.doneMeta}>
                      SKU {task.lager_id}
                      <span className={styles.sep}>•</span>
                      {task.history_date}
                      <span className={styles.sep}>•</span>
                      {shared ? (
                        <span className={styles.presDoneBatch}>
                          ↳ партія{task.started_at ? ` ${formatTime(task.started_at)}` : ""} · спільна з іншими
                          філіями
                        </span>
                      ) : (
                        "окрема задача"
                      )}
                    </p>
                  </div>
                  <div className={styles.doneQtyCol}>
                    <span className={styles.doneQtyMade}>
                      {formatNumber(made)}
                      <small> {task.unit ?? "кг"}</small>
                    </span>
                    <span className={differs ? styles.doneQtyPlanDiff : styles.doneQtyPlan}>
                      замовлено {formatNumber(task.quantity)}
                    </span>
                  </div>
                  {task.completed_at ? (
                    <span className={styles.doneAt}>✓ {formatTime(task.completed_at)}</span>
                  ) : null}
                </div>
              );
            })}
          </section>
        );
      })}

      {confirmOpen ? (
        <div className={styles.modalOverlay} onClick={() => setConfirmOpen(false)}>
          <div
            className={styles.presConfirm}
            role="dialog"
            aria-modal="true"
            aria-labelledby="pres-confirm-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id="pres-confirm-title" className={styles.presConfirmTitle}>
              Оформити {countLabel(pending.length, DOC_FORMS)}?
            </h3>
            <p className={styles.presConfirmText}>Для кожної філії буде сформовано окремий трансфер у Рубікон.</p>
            <ul className={styles.presConfirmList}>
              {pending.map((section) => (
                <li key={section.filialId} className={styles.presConfirmItem}>
                  <span>
                    <b>{getFilialShortName(section.filialId)}</b> · {countLabel(section.selected.length, TASK_FORMS)}
                  </span>
                  <span>{formatQtyPair(section.pcs, section.kg)}</span>
                </li>
              ))}
            </ul>
            <div className={styles.presConfirmFooter}>
              <button type="button" className={styles.presConfirmCancel} onClick={() => setConfirmOpen(false)}>
                Скасувати
              </button>
              <button
                type="button"
                className={styles.presConfirmOk}
                disabled={anyBusy}
                onClick={() => void documentSections(pending)}
              >
                Оформити {countLabel(pending.length, DOC_FORMS)}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
