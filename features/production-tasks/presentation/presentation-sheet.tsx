"use client";

import { Fragment, useState, type CSSProperties } from "react";
import { clsx } from "clsx";

import { getFilialShortName } from "@/domain/filials";
import {
  normPriority,
  readyMs,
  type LagerLane,
  type NormPriority,
  type TaskGroup
} from "@/lib/presentation-grouping";
import type { KitchenTask } from "../types";
import { priorityBadgeClass } from "./presentation-layers";
import {
  PRIORITY_VIEW,
  WORDS,
  batchStatusLine,
  clockDay,
  clockTime,
  countLabel,
  filialSpreadLabel,
  formatClock,
  formatQty,
  laneBadges,
  lateText,
  sheetLayout,
  sliceByFilial
} from "./presentation-view";
import styles from "./presentation.module.css";

const ROW_TONE: Record<NormPriority, string> = {
  CRITICAL: styles.rowCritical,
  HIGH: styles.rowHigh,
  MEDIUM: styles.rowMedium
};

const DOT_TONE: Record<NormPriority, string> = {
  CRITICAL: styles.pdotCritical,
  HIGH: styles.pdotHigh,
  MEDIUM: styles.pdotMedium
};

function KebabIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="5" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="12" cy="19" r="2" />
    </svg>
  );
}

export interface SheetHandlers {
  onPrimary: (group: TaskGroup<KitchenTask>) => void;
  onKebab: (group: TaskGroup<KitchenTask>, anchor: HTMLElement) => void;
  onCell: (group: TaskGroup<KitchenTask>, filialId: number, anchor: HTMLElement) => void;
}

/**
 * «Партії»: one card per article (lager + unit) with its batches as rows and
 * one column per presentation filial. Tapping a filial header focuses it.
 */
export function PresentationSheet({
  filialIds,
  windowMinutes,
  lanes,
  selectedPriority,
  now,
  busyKeys,
  openMenuKey,
  handlers
}: {
  filialIds: number[];
  windowMinutes: number;
  lanes: LagerLane<KitchenTask>[];
  selectedPriority: string;
  now: number;
  busyKeys: ReadonlySet<string>;
  openMenuKey: string | null;
  handlers: SheetHandlers;
}) {
  const [focus, setFocus] = useState<number | null>(null);
  const focused = focus != null && filialIds.includes(focus) ? focus : null;
  const layout = sheetLayout(filialIds.length);
  const showTiers = selectedPriority === "all";
  const tierSizes = new Map<NormPriority, number>();
  for (const lane of lanes) tierSizes.set(lane.bestPriority, (tierSizes.get(lane.bestPriority) ?? 0) + 1);

  const vars = { "--cols": layout.columns, "--col-gap": `${layout.gap}px` } as CSSProperties;

  return (
    <div
      className={clsx(styles.sheet, layout.wide && styles.sheetWide)}
      data-focus={focused ?? undefined}
      style={vars}
    >
      <div className={styles.colHead}>
        <span className={styles.colLabel}>Готовність</span>
        <span className={styles.colLabel}>Партія</span>
        {filialIds.map((filialId) => (
          <button
            key={filialId}
            type="button"
            className={clsx(styles.filialHead, focused === filialId && styles.filialHeadFocused)}
            aria-pressed={focused === filialId}
            title="Виділити колонку філії"
            onClick={() => setFocus((current) => (current === filialId ? null : filialId))}
          >
            <span className={styles.filialHeadName}>{getFilialShortName(filialId)}</span>
            <span className={styles.filialHeadId}>{filialId}</span>
          </button>
        ))}
        <span className={styles.colLabelEnd}>Разом</span>
        <span />
      </div>

      {lanes.map((lane, index) => {
        const tierStarts = showTiers && (index === 0 || lanes[index - 1].bestPriority !== lane.bestPriority);
        const dim = focused != null && !lane.groups.some((group) => group.filialIds.includes(focused));
        return (
          <Fragment key={lane.key}>
            {tierStarts ? (
              <div className={styles.tier}>
                <span className={clsx(styles.tierDot, DOT_TONE[lane.bestPriority])} />
                {PRIORITY_VIEW[lane.bestPriority].tier} ·{" "}
                {countLabel(tierSizes.get(lane.bestPriority) ?? 0, WORDS.position)}
              </div>
            ) : null}
            <Lane
              lane={lane}
              dim={dim}
              filialIds={filialIds}
              focused={focused}
              windowMinutes={windowMinutes}
              now={now}
              busyKeys={busyKeys}
              openMenuKey={openMenuKey}
              handlers={handlers}
            />
          </Fragment>
        );
      })}
    </div>
  );
}

function Lane({
  lane,
  dim,
  filialIds,
  focused,
  windowMinutes,
  now,
  busyKeys,
  openMenuKey,
  handlers
}: {
  lane: LagerLane<KitchenTask>;
  dim: boolean;
  filialIds: number[];
  focused: number | null;
  windowMinutes: number;
  now: number;
  busyKeys: ReadonlySet<string>;
  openMenuKey: string | null;
  handlers: SheetHandlers;
}) {
  const badges = laneBadges(lane.groups);
  return (
    <section className={clsx(styles.lane, dim && styles.laneDim)} aria-label={lane.lagerName}>
      <header className={styles.laneHead}>
        <div className={styles.laneTitleBox}>
          <h3 className={styles.laneTitle} title={lane.lagerName}>
            {lane.lagerName}
          </h3>
          <div className={styles.laneMeta}>
            <span>SKU {lane.lagerId}</span>
            {badges.promo.length ? (
              <span className={clsx(styles.badge, styles.badgePromo)} title={`Акції: ${badges.promo.join(", ")}`}>
                Промо
              </span>
            ) : null}
            {badges.guest ? <span className={clsx(styles.badge, styles.badgeGuest)}>Обіцянка гостю</span> : null}
            {badges.ecom > 0 ? <span>e-com {formatQty(badges.ecom)}</span> : null}
            {badges.bakeryType ? <span>{badges.bakeryType}</span> : null}
          </div>
        </div>
        <span className={styles.laneSum}>
          {countLabel(lane.groups.length, WORDS.batch)} · {formatQty(lane.total)} {lane.unit}
        </span>
      </header>
      {lane.groups.map((group) => (
        <BatchRow
          key={group.key}
          group={group}
          filialIds={filialIds}
          focused={focused}
          windowMinutes={windowMinutes}
          now={now}
          busy={busyKeys.has(group.key)}
          menuOpen={openMenuKey === group.key}
          handlers={handlers}
        />
      ))}
    </section>
  );
}

function BatchRow({
  group,
  filialIds,
  focused,
  windowMinutes,
  now,
  busy,
  menuOpen,
  handlers
}: {
  group: TaskGroup<KitchenTask>;
  filialIds: number[];
  focused: number | null;
  windowMinutes: number;
  now: number;
  busy: boolean;
  menuOpen: boolean;
  handlers: SheetHandlers;
}) {
  const inProgress = group.status === "IN_PROGRESS";
  const multi = group.members.length > 1;
  const overdue = group.deadline != null && group.deadline < now;
  const deadlineDay = group.deadline != null ? clockDay(group.deadline, now) : null;
  const span = group.deadline != null && group.last != null ? group.last - group.deadline : 0;
  const windowMs = windowMinutes * 60000;
  const slices = new Map(sliceByFilial(group.members).map((slice) => [slice.filialId, slice]));
  const startedAt = group.startedAt ? Date.parse(group.startedAt) : Number.NaN;

  return (
    <div className={clsx(styles.row, ROW_TONE[group.priority], inProgress && styles.rowWork)}>
      <div className={styles.cell}>
        {deadlineDay ? (
          <span className={clsx(styles.deadlineDay, overdue && styles.deadlineLate)}>{deadlineDay}</span>
        ) : null}
        <span className={clsx(styles.deadline, overdue && styles.deadlineLate)}>
          {group.deadline != null ? clockTime(group.deadline) : "—"}
        </span>
        {overdue && group.deadline != null ? (
          <span className={styles.latePill}>Прострочено {lateText(group.deadline, now)}</span>
        ) : multi && span > 0 && group.last != null ? (
          <span className={styles.deadlineSub}>остання до {formatClock(group.last, now)}</span>
        ) : null}
        {multi && group.deadline != null ? (
          <span className={styles.track} aria-hidden="true">
            <span
              className={clsx(styles.trackFill, inProgress ? styles.pdotWork : DOT_TONE[group.priority])}
              style={{ width: `${Math.min(1, span / windowMs) * 100}%` }}
            />
            {group.members.map((member) => {
              const ready = readyMs(member.operational_ready_at);
              if (ready == null || group.deadline == null) return null;
              const offset = Math.min(1, Math.max(0, (ready - group.deadline) / windowMs));
              return (
                <span
                  key={member.id}
                  className={clsx(styles.trackDot, inProgress ? styles.pdotWork : DOT_TONE[normPriority(member.priority)])}
                  style={{ left: `${offset * 100}%` }}
                />
              );
            })}
          </span>
        ) : null}
      </div>

      <div className={clsx(styles.cell, styles.statusCell)}>
        {inProgress ? (
          <span className={clsx(styles.badge, styles.badgeWork)}>
            {Number.isNaN(startedAt) ? "В роботі" : `В роботі · з ${clockTime(startedAt)}`}
          </span>
        ) : (
          <span className={clsx(styles.badge, priorityBadgeClass(group.priority))}>
            {PRIORITY_VIEW[group.priority].label}
          </span>
        )}
        <span className={styles.statusLine}>{batchStatusLine(group, windowMinutes, now)}</span>
      </div>

      {filialIds.map((filialId) => {
        const slice = slices.get(filialId);
        const isFocused = focused === filialId;
        if (!slice) {
          return (
            <div key={filialId} className={clsx(styles.fcellEmpty, isFocused && styles.fcellFocused)}>
              <span className={styles.nil}>—</span>
            </div>
          );
        }
        const late = slice.readyAt != null && slice.readyAt < now;
        const name = getFilialShortName(filialId);
        return (
          <button
            key={filialId}
            type="button"
            className={clsx(styles.fcell, isFocused && styles.fcellFocused)}
            aria-label={`${name}: ${formatQty(slice.quantity)} ${group.unit}`}
            aria-haspopup="dialog"
            onClick={(event) => handlers.onCell(group, filialId, event.currentTarget)}
          >
            {slice.priority !== group.priority ? (
              <span
                className={clsx(styles.fchip, priorityBadgeClass(slice.priority))}
                title={`${PRIORITY_VIEW[slice.priority].label} для цієї філії`}
              >
                {PRIORITY_VIEW[slice.priority].short}
              </span>
            ) : null}
            <span className={styles.fqty}>
              {formatQty(slice.quantity)}
              <small>{group.unit}</small>
            </span>
            {slice.readyAt == null ? null : late ? (
              <span className={styles.fsubLate}>прострочено {lateText(slice.readyAt, now)}</span>
            ) : (
              <span className={styles.fsub}>до {formatClock(slice.readyAt, now)}</span>
            )}
          </button>
        );
      })}

      <div className={clsx(styles.cell, styles.sigCell)}>
        <span className={styles.sigma}>
          {formatQty(group.total)}
          <small>{group.unit}</small>
        </span>
        <span className={styles.sigLine}>{filialSpreadLabel(group.filialIds)}</span>
      </div>

      <div className={clsx(styles.cell, styles.actCell)}>
        <button
          type="button"
          className={inProgress ? styles.ctaDone : styles.cta}
          disabled={busy}
          onClick={() => handlers.onPrimary(group)}
        >
          {inProgress ? (multi ? "✓ Завершити все" : "✓ Завершити") : multi ? "▶ Почати все" : "▶ Почати"}
        </button>
        <button
          type="button"
          className={clsx(styles.kebab, menuOpen && styles.kebabOpen)}
          aria-label="Дії з партією"
          aria-haspopup="dialog"
          aria-expanded={menuOpen}
          disabled={busy}
          onClick={(event) => handlers.onKebab(group, event.currentTarget)}
        >
          <KebabIcon />
        </button>
      </div>
    </div>
  );
}
