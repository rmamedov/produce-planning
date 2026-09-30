"use client";

import { Fragment, useMemo, useState, type CSSProperties } from "react";
import { clsx } from "clsx";

import { getFilialShortName } from "@/domain/filials";
import type { TaskGroup } from "@/lib/presentation-grouping";
import type { KitchenTask } from "../types";
import { priorityBadgeClass } from "./presentation-layers";
import {
  WORDS,
  buildPrepSheet,
  countLabel,
  formatClock,
  formatQty,
  formatWindowHours,
  prepInProgressNote,
  prepLayout,
  qtyPair
} from "./presentation-view";
import styles from "./presentation.module.css";

type Horizon = "window" | "all";

function QtyLines({ pcs, kg }: { pcs: number; kg: number }) {
  if (pcs === 0 && kg === 0) return <>—</>;
  return (
    <>
      {pcs ? <span className={styles.qtyLine}>{formatQty(pcs)} шт</span> : null}
      {kg ? (
        <span className={styles.qtyLine}>
          {pcs ? "+ " : ""}
          {formatQty(kg)} кг
        </span>
      ) : null}
    </>
  );
}

/**
 * «Заготовки»: read-only summary of what the NEW batches need, per article
 * and filial, grouped by bakery type. Batches already «В роботі» are left out.
 */
export function PresentationPrep({
  filialIds,
  windowMinutes,
  groups,
  now
}: {
  filialIds: number[];
  windowMinutes: number;
  groups: TaskGroup<KitchenTask>[];
  now: number;
}) {
  const [horizon, setHorizon] = useState<Horizon>("window");
  const horizonEnd = now + windowMinutes * 60000;
  const sheet = useMemo(
    () => buildPrepSheet(groups, horizon === "window" ? horizonEnd : null),
    [groups, horizon, horizonEnd]
  );
  const inProgress = groups.filter((group) => group.status === "IN_PROGRESS").length;
  const layout = prepLayout(filialIds.length);
  const vars = { "--cols": layout.columns, "--col-gap": `${layout.gap}px` } as CSSProperties;

  return (
    <div>
      <div className={styles.prepBar}>
        <div className={styles.segment} role="group" aria-label="Горизонт">
          <button
            type="button"
            className={horizon === "window" ? styles.segmentActive : styles.segmentBtn}
            aria-pressed={horizon === "window"}
            onClick={() => setHorizon("window")}
          >
            Партії, що стартують до {formatClock(horizonEnd, now)}
          </button>
          <button
            type="button"
            className={horizon === "all" ? styles.segmentActive : styles.segmentBtn}
            aria-pressed={horizon === "all"}
            onClick={() => setHorizon("all")}
          >
            Усі на сьогодні
          </button>
        </div>
        <p className={styles.prepHint}>
          Лише для читання. Вікно групування ({formatWindowHours(windowMinutes)}) формує партії,
          горизонт — які партії потрапляють у лист.
          {inProgress ? ` ${prepInProgressNote(inProgress)}` : ""}
        </p>
      </div>

      {sheet.sections.length === 0 ? (
        <div className={styles.empty}>
          <h3 className={styles.emptyTitle}>
            {horizon === "window"
              ? `Немає партій «До виконання» до ${formatClock(horizonEnd, now)}`
              : "Немає партій «До виконання»"}
          </h3>
          <p className={styles.emptyText}>
            {horizon === "window"
              ? "Перемкніть на «Усі на сьогодні», щоб побачити пізніші партії."
              : "Усе, що є на дошці, уже в роботі."}
          </p>
        </div>
      ) : (
        <div className={clsx(styles.prep, layout.wide && styles.prepWide)} style={vars}>
          <div className={styles.prepHead}>
            <span className={styles.colLabel}>Виріб</span>
            {filialIds.map((filialId) => (
              <span key={filialId} className={styles.prepHeadFilial}>
                <span className={styles.filialHeadName}>{getFilialShortName(filialId)}</span>
                <span className={styles.filialHeadId}>{filialId}</span>
              </span>
            ))}
            <span className={styles.colLabelEnd}>Разом</span>
            <span className={styles.colLabel}>Партії</span>
          </div>

          {sheet.sections.map((section) => (
            <Fragment key={section.key}>
              <div className={styles.prepSection}>
                <span className={styles.prepSectionTitle}>{section.title}</span>
                <span className={styles.prepSectionSum}>
                  {countLabel(section.rows.length, WORDS.position)} · {qtyPair(section.pcs, section.kg)}
                </span>
              </div>
              {section.rows.map((row) => (
                <div key={row.key} className={styles.prepRow}>
                  <div className={styles.prepName}>
                    <div className={styles.prepNameTitle} title={row.lagerName}>
                      {row.lagerName}
                    </div>
                    <div className={styles.prepSku}>SKU {row.lagerId}</div>
                  </div>
                  {filialIds.map((filialId) =>
                    row.perFilial[filialId] ? (
                      <span key={filialId} className={styles.prepQty}>
                        {formatQty(row.perFilial[filialId])}
                      </span>
                    ) : (
                      <span key={filialId} className={clsx(styles.prepQty, styles.nil)}>
                        —
                      </span>
                    )
                  )}
                  <span className={styles.prepSigma}>
                    {formatQty(row.total)}
                    <small>{row.unit}</small>
                  </span>
                  <div className={styles.chips}>
                    {row.chips.map((chip) => (
                      <span key={chip.key} className={clsx(styles.chip, priorityBadgeClass(chip.priority))}>
                        {chip.deadline != null ? formatClock(chip.deadline, now) : "Без часу"} ·{" "}
                        {formatQty(chip.total)} {row.unit}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </Fragment>
          ))}

          <div className={styles.prepTotal}>
            <span className={styles.prepTotalLabel}>Разом у листі</span>
            {filialIds.map((filialId) => (
              <span key={filialId} className={styles.prepTotalQty}>
                <QtyLines pcs={sheet.perFilial[filialId]?.pcs ?? 0} kg={sheet.perFilial[filialId]?.kg ?? 0} />
              </span>
            ))}
            <span className={styles.prepTotalSigma}>
              <QtyLines pcs={sheet.pcs} kg={sheet.kg} />
            </span>
            <span />
          </div>
        </div>
      )}
    </div>
  );
}
