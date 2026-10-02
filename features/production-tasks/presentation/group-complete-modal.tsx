"use client";

import { useReducer } from "react";

import { getFilialShortName } from "@/domain/filials";
import { normPriority, readyMs, type Unit } from "@/lib/presentation-grouping";
import { parseQuantity } from "@/lib/produced-quantity-input";
import type { KitchenTask } from "../types";
import { ModalOverlay } from "./presentation-layers";
import {
  PRIORITY_VIEW,
  WORDS,
  completeReducer,
  countLabel,
  deltaLabel,
  displayedTotal,
  distributionHint,
  formatClock,
  formatQty,
  initialCompleteState,
  memberLabels,
  rowSum
} from "./presentation-view";
import styles from "./presentation.module.css";

export interface CompleteItem {
  task_id: string;
  produced_qty: number;
}

const PRIORITY_DOT = {
  critical: styles.pdotCritical,
  high: styles.pdotHigh,
  medium: styles.pdotMedium
};

const DELTA_CLASS = {
  eq: styles.deltaEq,
  minus: styles.deltaMinus,
  plus: styles.deltaPlus
};

/**
 * «Скільки виготовлено?» for a whole batch: one total on the numpad, split
 * across the members (urgency order) by distributeProduced; any row can be
 * overridden by hand. With a single member only the left panel is shown.
 */
export function GroupCompleteModal({
  lagerName,
  unit,
  members,
  now,
  busy,
  onCancel,
  onConfirm
}: {
  lagerName: string;
  unit: Unit;
  members: KitchenTask[];
  now: number;
  /** Saving: every input is locked until the board has refetched. */
  busy: boolean;
  onCancel: () => void;
  onConfirm: (items: CompleteItem[], produced: number[]) => void;
}) {
  const [state, dispatch] = useReducer(completeReducer, undefined, () =>
    initialCompleteState(
      members.map((member) => member.quantity),
      unit
    )
  );

  const compact = members.length === 1;
  const names = members.map((member) => getFilialShortName(member.filial_id));
  const labels = memberLabels(members, now);
  const filialCount = new Set(members.map((member) => member.filial_id)).size;
  const ordered = Math.round(state.ordered.reduce((sum, quantity) => sum + quantity, 0) * 10) / 10;
  const sum = rowSum(state);
  const hint = distributionHint(state, names);
  const produced = state.rows.map(parseQuantity);
  const totalTargeted = state.target === "total";

  const confirm = () => {
    const items = members
      .map((member, index) => ({ task_id: member.id, produced_qty: produced[index] }))
      .filter((item) => item.produced_qty > 0);
    onConfirm(items, produced);
  };

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", unit === "кг" ? "," : "С", "0", "⌫"];
  const press = (key: string) => {
    if (key === "С") dispatch({ type: "clear" });
    else if (key === ",") dispatch({ type: "comma" });
    else if (key === "⌫") dispatch({ type: "backspace" });
    else dispatch({ type: "digit", digit: key });
  };

  const targetText = compact
    ? `Зараз вводите: ${names[0]}`
    : totalTargeted
      ? "Зараз вводите: разом на всі філії"
      : `Зараз вводите: ${labels[state.target as number]}`;

  return (
    <ModalOverlay label="Скільки виготовлено?" busy={busy} onClose={onCancel}>
      <div className={compact ? styles.gmCompact : styles.gm}>
        <div className={styles.gmBody}>
          <div className={styles.gmLeft}>
            <p className={styles.gmTitle}>Скільки виготовлено?</p>
            <p className={styles.gmProduct}>{lagerName}</p>
            <span className={styles.orderChip}>
              Замовлено: {formatQty(ordered)} {unit} ·{" "}
              {compact ? names[0] : countLabel(filialCount, WORDS.filial)}
            </span>

            <div className={styles.totRow}>
              <button
                type="button"
                className={styles.stepper}
                aria-label="Менше"
                disabled={busy}
                onClick={() => dispatch({ type: "step", direction: -1 })}
              >
                −
              </button>
              <button
                type="button"
                className={totalTargeted ? styles.totTarget : styles.tot}
                aria-label="Разом виготовлено"
                data-autofocus
                disabled={busy}
                onClick={() => dispatch({ type: "target", target: "total" })}
              >
                <span className={styles.totLabel}>Разом виготовлено</span>
                <span className={styles.totValue}>
                  {displayedTotal(state)}
                  <small>{unit}</small>
                </span>
              </button>
              <button
                type="button"
                className={styles.stepper}
                aria-label="Більше"
                disabled={busy}
                onClick={() => dispatch({ type: "step", direction: 1 })}
              >
                +
              </button>
            </div>

            <p className={styles.targetLine}>{targetText}</p>

            <div className={styles.pad}>
              {keys.map((key) => (
                <button
                  key={key}
                  type="button"
                  className={/\d/.test(key) ? styles.key : styles.keyMuted}
                  aria-label={key === "С" ? "Очистити" : key === "⌫" ? "Стерти" : undefined}
                  disabled={busy}
                  onClick={() => press(key)}
                >
                  {key}
                </button>
              ))}
            </div>

            {compact && sum <= 0 ? <p className={styles.hintWarn}>{hint.text}</p> : null}
          </div>

          {compact ? null : (
            <div className={styles.gmRight}>
              <h4 className={styles.gmRightTitle}>Розподіл по філіях</h4>
              <p className={styles.rule}>
                Нестачу отримують найменш термінові філії (знизу списку), надлишок ділиться
                пропорційно замовленню. Будь-який рядок можна поправити вручну — тапніть по ньому.
              </p>
              <div className={styles.dist}>
                {members.map((member, index) => {
                  const value = produced[index];
                  const delta = deltaLabel(value, member.quantity);
                  const readyAt = readyMs(member.operational_ready_at);
                  const tone = PRIORITY_VIEW[normPriority(member.priority)].tone;
                  return (
                    <button
                      key={member.id}
                      type="button"
                      className={state.target === index ? styles.drowTarget : styles.drow}
                      aria-pressed={state.target === index}
                      disabled={busy}
                      onClick={() => dispatch({ type: "target", target: index })}
                    >
                      <span>
                        <span className={styles.dname}>
                          <span className={`${styles.pdot} ${PRIORITY_DOT[tone]}`} />
                          <span className={styles.dnameText}>{labels[index]}</span>
                        </span>
                        <span className={styles.dsub}>
                          замовлено {formatQty(member.quantity)} {unit}
                          {readyAt != null ? ` · до ${formatClock(readyAt, now)}` : ""}
                        </span>
                      </span>
                      <span className={value === 0 ? styles.dvalueZero : styles.dvalue}>
                        {state.rows[index]}
                        <small>{unit}</small>
                      </span>
                      <span className={`${styles.delta} ${DELTA_CLASS[delta.tone]}`}>{delta.text}</span>
                      {value === 0 ? (
                        <span className={styles.zeroNote}>
                          0 — ця філія залишиться «В роботі» і не піде у «Виконані»
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
              <p className={hint.tone === "warn" ? styles.hintWarn : styles.hint}>{hint.text}</p>
              {state.manual ? (
                <button
                  type="button"
                  className={styles.relink}
                  disabled={busy}
                  onClick={() => dispatch({ type: "auto" })}
                >
                  ↺ Розподілити автоматично
                </button>
              ) : null}
            </div>
          )}
        </div>

        <div className={styles.gmFooter}>
          <button type="button" className={styles.btnCancel} disabled={busy} onClick={onCancel}>
            Скасувати
          </button>
          <button
            type="button"
            className={`${styles.btnOk} ${styles.btnConfirm}`}
            disabled={busy || sum <= 0}
            onClick={confirm}
          >
            {busy ? "Зберігаємо…" : `✓ Підтвердити · ${formatQty(sum)} ${unit}`}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}
