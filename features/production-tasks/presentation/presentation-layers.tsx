"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { getFilialShortName } from "@/domain/filials";
import type { TaskGroup } from "@/lib/presentation-grouping";
import type { KitchenTask } from "../types";
import {
  PRIORITY_VIEW,
  WORDS,
  countLabel,
  formatClock,
  formatQty,
  lateText,
  sliceByFilial,
  type FilialSlice
} from "./presentation-view";
import styles from "./presentation.module.css";

export const CANNOT_PRODUCE_REASONS = [
  "Недостатньо сировини",
  "Немає електроенергії",
  "Немає потрібного обладнання",
  "Не вистачає персоналу"
];

const GAP = 8;

function focusables(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>("button:not(:disabled)"));
}

/** Focuses the `data-autofocus` control, else the first enabled one. */
function focusInitial(container: HTMLElement | null) {
  if (!container) return;
  const preferred = container.querySelector<HTMLElement>("[data-autofocus]:not(:disabled)");
  (preferred ?? focusables(container)[0])?.focus({ preventScroll: true });
}

/** Hands focus back to the opener unless the user has already moved it elsewhere. */
function restoreFocus(opener: Element | null, container: HTMLElement | null) {
  const active = document.activeElement;
  const lost = !active || active === document.body || (container?.contains(active) ?? false);
  if (lost && opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true });
}

function trapTab(event: KeyboardEvent, container: HTMLElement) {
  const items = focusables(container);
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;
  if (!active || !container.contains(active)) {
    event.preventDefault();
    first.focus();
  } else if (event.shiftKey && active === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}

export function CheckIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

/**
 * A `position: fixed` layer next to its anchor. Opens below when there is
 * room, flips above otherwise; closes on an outside tap, Escape or scroll.
 * Takes focus once placed and hands it back to the anchor on close.
 */
export function FloatingLayer({
  anchor,
  className,
  label,
  onClose,
  children
}: {
  anchor: HTMLElement;
  className: string;
  label: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useLayoutEffect(() => {
    const layer = ref.current;
    if (!layer) return;
    const rect = anchor.getBoundingClientRect();
    const height = layer.offsetHeight;
    const width = layer.offsetWidth;
    const below = rect.bottom + GAP;
    const top =
      below + height > window.innerHeight - GAP ? Math.max(GAP, rect.top - height - GAP) : below;
    const left = Math.max(GAP, Math.min(rect.right - width, window.innerWidth - width - GAP));
    setPosition({ top, left });
  }, [anchor]);

  // A hidden (not yet placed) layer cannot take focus.
  const placed = position != null;
  useEffect(() => {
    if (placed) focusInitial(ref.current);
  }, [placed]);

  useEffect(() => {
    const layer = ref.current;
    return () => restoreFocus(anchor, layer);
  }, [anchor]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (ref.current?.contains(target) || anchor.contains(target)) return;
      closeRef.current();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeRef.current();
    };
    const onScroll = (event: Event) => {
      if (ref.current?.contains(event.target as Node)) return;
      closeRef.current();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [anchor]);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={label}
      className={`${styles.layer} ${className}`}
      style={position ?? { top: 0, left: 0, visibility: "hidden" }}
    >
      {children}
    </div>
  );
}

export function KebabMenu({
  group,
  anchor,
  onClose,
  onSubset,
  onRevert,
  onCannot
}: {
  group: TaskGroup<KitchenTask>;
  anchor: HTMLElement;
  onClose: () => void;
  onSubset: () => void;
  onRevert: () => void;
  onCannot: () => void;
}) {
  const inProgress = group.status === "IN_PROGRESS";
  return (
    <FloatingLayer anchor={anchor} className={styles.menu} label="Дії з партією" onClose={onClose}>
      {inProgress ? (
        <button type="button" className={styles.menuItem} onClick={onRevert}>
          ↩ Повернути в «До виконання»
        </button>
      ) : (
        <button
          type="button"
          className={styles.menuItem}
          disabled={group.filialIds.length < 2}
          onClick={onSubset}
        >
          ▶ Почати лише для частини філій…
        </button>
      )}
      <button type="button" className={styles.menuItemDanger} onClick={onCannot}>
        Неможливо виготовити…
      </button>
    </FloatingLayer>
  );
}

export function CellPopover({
  group,
  slice,
  anchor,
  now,
  busy,
  onClose,
  onStart,
  onComplete,
  onCannot
}: {
  group: TaskGroup<KitchenTask>;
  slice: FilialSlice<KitchenTask>;
  anchor: HTMLElement;
  now: number;
  busy: boolean;
  onClose: () => void;
  onStart: () => void;
  onComplete: () => void;
  onCannot: () => void;
}) {
  const name = getFilialShortName(slice.filialId);
  const late = slice.readyAt != null && slice.readyAt < now;
  const stockTask = slice.members.find((member) => member.current_stock_qty != null);
  const stock = stockTask?.current_stock_qty;
  const priority = PRIORITY_VIEW[slice.priority];
  const inProgress = group.status === "IN_PROGRESS";

  return (
    <FloatingLayer anchor={anchor} className={styles.popover} label={`${name} · ${group.lagerName}`} onClose={onClose}>
      <div className={styles.popHead}>
        <p className={styles.popTitle}>
          {name} · {formatQty(slice.quantity)} {group.unit}
        </p>
        <div className={styles.popFacts}>
          <span className={styles.popFact}>
            {slice.readyAt != null ? (
              <>
                <span>
                  Готовність до <b>{formatClock(slice.readyAt, now)}</b>
                </span>
                <span className={`${styles.badge} ${late ? styles.badgeLate : styles.badgeOnTime}`}>
                  {late ? `Прострочено ${lateText(slice.readyAt, now)}` : "Вчасно"}
                </span>
              </>
            ) : (
              <span>Без часу готовності</span>
            )}
          </span>
          <span className={styles.popFact}>
            <span>
              Залишок на полиці:{" "}
              <b>{stock != null ? `${formatQty(stock)} ${group.unit}` : "—"}</b>
            </span>
          </span>
          <span className={styles.popFact}>
            <span className={`${styles.badge} ${priorityBadgeClass(slice.priority)}`}>{priority.label}</span>
          </span>
        </div>
      </div>
      {inProgress ? (
        <button type="button" className={`${styles.popPrimary} ${styles.popPrimaryDone}`} disabled={busy} onClick={onComplete}>
          ✓ Завершити лише цю філію
        </button>
      ) : (
        <button type="button" className={styles.popPrimary} disabled={busy} onClick={onStart}>
          ▶ Почати лише цю філію
        </button>
      )}
      <button type="button" className={styles.popDanger} onClick={onCannot}>
        Неможливо виготовити — {name}
      </button>
    </FloatingLayer>
  );
}

export function priorityBadgeClass(priority: keyof typeof PRIORITY_VIEW): string {
  const tone = PRIORITY_VIEW[priority].tone;
  if (tone === "critical") return styles.badgeCritical;
  if (tone === "high") return styles.badgeHigh;
  return styles.badgeMedium;
}

/**
 * Fixed overlay; a tap outside the card or Escape closes it (unless busy).
 * Focus moves in on open, Tab stays inside, and the opener gets it back.
 */
export function ModalOverlay({
  label,
  busy,
  onClose,
  children
}: {
  label: string;
  busy?: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const busyRef = useRef(busy);
  busyRef.current = busy;

  useEffect(() => {
    const overlay = ref.current;
    // A layer that opened this modal has already handed focus back to its anchor.
    const opener = document.activeElement;
    focusInitial(overlay);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busyRef.current) closeRef.current();
      else if (event.key === "Tab" && overlay) trapTab(event, overlay);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      restoreFocus(opener, overlay);
    };
  }, []);

  return (
    <div
      ref={ref}
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      {children}
    </div>
  );
}

function PickRow({
  slice,
  unit,
  now,
  checked,
  onToggle
}: {
  slice: FilialSlice<KitchenTask>;
  unit: string;
  now: number;
  checked: boolean;
  onToggle: () => void;
}) {
  const sub = [
    slice.readyAt != null ? `до ${formatClock(slice.readyAt, now)}` : "без часу",
    PRIORITY_VIEW[slice.priority].label
  ].join(" · ");
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      className={checked ? styles.pickRow : styles.pickRowOff}
      onClick={onToggle}
    >
      <span className={styles.check}>
        <CheckIcon />
      </span>
      <span className={styles.pickName}>
        {getFilialShortName(slice.filialId)}
        <span className={styles.pickSub}>{sub}</span>
      </span>
      <span className={styles.pickQty}>
        {formatQty(slice.quantity)} {unit}
      </span>
    </button>
  );
}

function useChecked(slices: FilialSlice<KitchenTask>[]) {
  const [unchecked, setUnchecked] = useState<Set<number>>(new Set());
  const toggle = (filialId: number) =>
    setUnchecked((current) => {
      const next = new Set(current);
      if (next.has(filialId)) next.delete(filialId);
      else next.add(filialId);
      return next;
    });
  const picked = slices.filter((slice) => !unchecked.has(slice.filialId));
  return { unchecked, toggle, picked };
}

/** «Почати для частини філій»: unchecked filials regroup with the other NEW orders. */
export function SubsetModal({
  group,
  now,
  busy,
  onClose,
  onStart
}: {
  group: TaskGroup<KitchenTask>;
  now: number;
  busy: boolean;
  onClose: () => void;
  onStart: (members: KitchenTask[]) => void;
}) {
  const slices = sliceByFilial(group.members);
  const { unchecked, toggle, picked } = useChecked(slices);
  const quantity = Math.round(picked.reduce((sum, slice) => sum + slice.quantity, 0) * 10) / 10;

  return (
    <ModalOverlay label="Почати для частини філій" busy={busy} onClose={onClose}>
      <div className={styles.smModal}>
        <h3 className={styles.smTitle}>Почати для частини філій</h3>
        <p className={styles.smText}>
          {group.lagerName}. Невідмічені філії повернуться в «До виконання» і згрупуються з іншими
          замовленнями за часом групування.
        </p>
        <div className={styles.pickList}>
          {slices.map((slice) => (
            <PickRow
              key={slice.filialId}
              slice={slice}
              unit={group.unit}
              now={now}
              checked={!unchecked.has(slice.filialId)}
              onToggle={() => toggle(slice.filialId)}
            />
          ))}
        </div>
        <div className={styles.smFooter}>
          <button type="button" className={styles.btnCancel} disabled={busy} onClick={onClose}>
            Скасувати
          </button>
          <button
            type="button"
            className={`${styles.btnOk} ${styles.btnStartOk}`}
            disabled={busy || picked.length === 0}
            onClick={() => onStart(picked.flatMap((slice) => slice.members))}
          >
            ▶ Почати · {countLabel(picked.length, WORDS.filial)} · {formatQty(quantity)} {group.unit}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}

/** «Неможливо виготовити» for a batch or one filial: filials + reason. */
export function CannotModal({
  lagerName,
  unit,
  members,
  now,
  busy,
  onClose,
  onConfirm
}: {
  lagerName: string;
  unit: string;
  members: KitchenTask[];
  now: number;
  busy: boolean;
  onClose: () => void;
  onConfirm: (members: KitchenTask[], reason: string) => void;
}) {
  const slices = sliceByFilial(members);
  const { unchecked, toggle, picked } = useChecked(slices);

  return (
    <ModalOverlay label="Неможливо виготовити" busy={busy} onClose={onClose}>
      <div className={styles.smModal}>
        <h3 className={styles.smTitle}>Неможливо виготовити</h3>
        <p className={styles.smText}>{lagerName}. Оберіть філії та причину.</p>
        <p className={styles.sectionLabel}>Філії</p>
        <div className={styles.pickList}>
          {slices.map((slice) => (
            <PickRow
              key={slice.filialId}
              slice={slice}
              unit={unit}
              now={now}
              checked={!unchecked.has(slice.filialId)}
              onToggle={() => toggle(slice.filialId)}
            />
          ))}
        </div>
        <p className={styles.sectionLabel}>Причина</p>
        <div className={styles.reasonList}>
          {CANNOT_PRODUCE_REASONS.map((reason) => (
            <button
              key={reason}
              type="button"
              className={styles.reasonBtn}
              disabled={busy || picked.length === 0}
              onClick={() => onConfirm(picked.flatMap((slice) => slice.members), reason)}
            >
              {reason}
            </button>
          ))}
        </div>
        <div className={styles.smFooter}>
          <button type="button" className={styles.btnCancel} disabled={busy} onClick={onClose}>
            Скасувати
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}
