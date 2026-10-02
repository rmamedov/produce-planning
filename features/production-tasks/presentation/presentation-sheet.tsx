"use client";

import { Fragment, useEffect, useMemo, useState, type CSSProperties } from "react";
import { clsx } from "clsx";

import { getFilialShortName } from "@/domain/filials";
import type { LagerLane, NormPriority, TaskGroup } from "@/lib/presentation-grouping";
import type { KitchenTask } from "../types";
import { priorityBadgeClass } from "./presentation-layers";
import {
  PRIORITY_VIEW,
  WORDS,
  batchLastText,
  batchTiles,
  clockDay,
  clockTime,
  countLabel,
  filialSpreadLabel,
  formatQty,
  laneBadges,
  lateText,
  sheetLayout,
  type BatchTile
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

/** A compact tile marks a filial priority that differs from the batch with its own rail. */
const TILE_RAIL: Record<NormPriority, string> = {
  CRITICAL: styles.tileRailCritical,
  HIGH: styles.tileRailHigh,
  MEDIUM: styles.tileRailMedium
};

const TILES_HINT_KEY = "kitchen.tilesHintShown";
/** Two 1.4 s rings of .tilePulse. */
const TILES_HINT_MS = 2800;

/** True once per tablet session; without storage the hint is skipped. */
function claimTilesHint(): boolean {
  try {
    if (window.sessionStorage.getItem(TILES_HINT_KEY)) return false;
    window.sessionStorage.setItem(TILES_HINT_KEY, "1");
    return true;
  } catch {
    return false;
  }
}

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

export interface OpenCell {
  groupKey: string;
  filialId: number;
}

/**
 * «Партії»: one card per article (lager + unit) with its batches as rows;
 * each row has a named tile per filial, in fixed slots under the header
 * chips. Tapping a chip focuses that filial.
 */
export function PresentationSheet({
  filialIds,
  lanes,
  selectedPriority,
  now,
  busyKeys,
  openMenuKey,
  openCell,
  handlers
}: {
  filialIds: number[];
  lanes: LagerLane<KitchenTask>[];
  selectedPriority: string;
  now: number;
  busyKeys: ReadonlySet<string>;
  openMenuKey: string | null;
  openCell: OpenCell | null;
  handlers: SheetHandlers;
}) {
  const [focus, setFocus] = useState<number | null>(null);
  const focused = focus != null && filialIds.includes(focus) ? focus : null;
  const layout = sheetLayout(filialIds.length);
  const showTiers = selectedPriority === "all";
  const tierSizes = new Map<NormPriority, number>();
  for (const lane of lanes) tierSizes.set(lane.bestPriority, (tierSizes.get(lane.bestPriority) ?? 0) + 1);

  const firstMulti =
    lanes.flatMap((lane) => lane.groups).find((group) => group.filialIds.length > 1)?.key ?? null;
  const [hintKey, setHintKey] = useState<string | null>(null);
  useEffect(() => {
    if (firstMulti != null && claimTilesHint()) setHintKey(firstMulti);
  }, [firstMulti]);
  // Dropping the class keeps a remounted row from ringing again.
  useEffect(() => {
    if (hintKey == null) return;
    const timer = window.setTimeout(() => setHintKey(null), TILES_HINT_MS);
    return () => window.clearTimeout(timer);
  }, [hintKey]);

  // The hint has done its job once the cook taps a tile or a chip; the open
  // and focus rings must not wait for the pulse to end.
  const rowHandlers = useMemo<SheetHandlers>(
    () => ({
      ...handlers,
      onCell: (group, filialId, anchor) => {
        setHintKey(null);
        handlers.onCell(group, filialId, anchor);
      }
    }),
    [handlers]
  );

  const vars = { "--cols": layout.columns, "--tiles": layout.tiles } as CSSProperties;

  return (
    <div
      className={clsx(styles.sheet, layout.compact && styles.sheetCompact)}
      data-focus={focused ?? undefined}
      style={vars}
    >
      <div className={styles.colHead}>
        <span className={styles.colLabel}>Готовність</span>
        <div className={styles.tiles}>
          {filialIds.map((filialId) => (
            <button
              key={filialId}
              type="button"
              className={clsx(styles.focusChip, focused === filialId && styles.focusChipOn)}
              aria-pressed={focused === filialId}
              title="Виділити філію"
              onClick={() => {
                setHintKey(null);
                setFocus((current) => (current === filialId ? null : filialId));
              }}
            >
              {getFilialShortName(filialId)}
            </button>
          ))}
        </div>
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
              compact={layout.compact}
              now={now}
              busyKeys={busyKeys}
              openMenuKey={openMenuKey}
              openCell={openCell}
              hintKey={hintKey}
              handlers={rowHandlers}
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
  compact,
  now,
  busyKeys,
  openMenuKey,
  openCell,
  hintKey,
  handlers
}: {
  lane: LagerLane<KitchenTask>;
  dim: boolean;
  filialIds: number[];
  focused: number | null;
  compact: boolean;
  now: number;
  busyKeys: ReadonlySet<string>;
  openMenuKey: string | null;
  openCell: OpenCell | null;
  hintKey: string | null;
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
          compact={compact}
          now={now}
          busy={busyKeys.has(group.key)}
          menuOpen={openMenuKey === group.key}
          openFilial={openCell?.groupKey === group.key ? openCell.filialId : null}
          pulse={hintKey === group.key}
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
  compact,
  now,
  busy,
  menuOpen,
  openFilial,
  pulse,
  handlers
}: {
  group: TaskGroup<KitchenTask>;
  filialIds: number[];
  focused: number | null;
  compact: boolean;
  now: number;
  busy: boolean;
  menuOpen: boolean;
  openFilial: number | null;
  pulse: boolean;
  handlers: SheetHandlers;
}) {
  const inProgress = group.status === "IN_PROGRESS";
  const multi = group.members.length > 1;
  const overdue = group.deadline != null && group.deadline < now;
  const deadlineDay = group.deadline != null ? clockDay(group.deadline, now) : null;
  const startedAt = group.startedAt ? Date.parse(group.startedAt) : Number.NaN;
  const tiles = batchTiles(group, filialIds, now);
  const lastText = batchLastText(group, now);

  return (
    <div className={clsx(styles.row, ROW_TONE[group.priority], inProgress && styles.rowWork)}>
      <div className={styles.readyCell}>
        <span className={styles.deadlineBox}>
          {deadlineDay ? <span className={styles.deadlineDay}>{deadlineDay}</span> : null}
          <span className={clsx(styles.deadline, overdue && styles.deadlineLate)}>
            {group.deadline != null ? clockTime(group.deadline) : "—"}
          </span>
        </span>
        {inProgress ? (
          <span className={clsx(styles.badge, styles.badgeWork)}>
            {Number.isNaN(startedAt) ? "В роботі" : `В роботі · з ${clockTime(startedAt)}`}
          </span>
        ) : overdue && group.deadline != null ? (
          <span className={clsx(styles.badge, styles.badgeOverdue)}>
            Прострочено {lateText(group.deadline, now)}
          </span>
        ) : (
          <span className={clsx(styles.badge, priorityBadgeClass(group.priority))}>
            {PRIORITY_VIEW[group.priority].label}
          </span>
        )}
        {lastText ? <span className={styles.deadlineSub}>{lastText}</span> : null}
      </div>

      <div className={styles.tiles}>
        {tiles.map((tile, index) =>
          tile ? (
            <FilialTile
              key={filialIds[index]}
              tile={tile}
              unit={group.unit}
              compact={compact}
              focused={focused === filialIds[index]}
              open={openFilial === filialIds[index]}
              pulse={pulse}
              busy={busy}
              onOpen={(anchor) => handlers.onCell(group, filialIds[index], anchor)}
            />
          ) : (
            <div key={filialIds[index]} className={styles.slot} aria-hidden="true" />
          )
        )}
      </div>

      <div className={styles.sigCell}>
        <span className={styles.sigma}>
          {formatQty(group.total)}
          <small>{group.unit}</small>
        </span>
        <span className={styles.sigLine}>{filialSpreadLabel(group.filialIds)}</span>
      </div>

      <div className={styles.actCell}>
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

/**
 * A busy tile stays focusable (`aria-disabled`, not `disabled`): «Почати лише …»
 * closes its popover in the same commit that marks the row busy, and focus has
 * to land back on the tile instead of falling to <body>.
 */
function FilialTile({
  tile,
  unit,
  compact,
  focused,
  open,
  pulse,
  busy,
  onOpen
}: {
  tile: BatchTile<KitchenTask>;
  unit: string;
  compact: boolean;
  focused: boolean;
  open: boolean;
  pulse: boolean;
  busy: boolean;
  onOpen: (anchor: HTMLElement) => void;
}) {
  // A text chip does not fit a compact tile beside a decimal or «×N» quantity:
  // there the filial's own priority is a rail, like the batch row's.
  const chip = compact ? null : tile.priority;
  const rail = compact ? tile.priority : null;
  return (
    <button
      type="button"
      className={clsx(
        styles.tile,
        rail && [styles.tileRail, TILE_RAIL[rail]],
        focused && styles.tileFocused,
        open && styles.tileOpen,
        pulse && styles.tilePulse
      )}
      aria-label={tile.ariaLabel}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-disabled={busy || undefined}
      onClick={(event) => {
        if (!busy) onOpen(event.currentTarget);
      }}
    >
      <span className={styles.tileHead}>
        <span className={styles.tileName}>{tile.name}</span>
        <span className={styles.tileGo} aria-hidden="true">
          ›
        </span>
      </span>
      <span className={styles.tileLine}>
        <span className={styles.tileQty}>
          {formatQty(tile.slice.quantity)}
          <small>{unit}</small>
        </span>
        {tile.orders > 1 ? <span className={styles.tileOrders}>×{tile.orders}</span> : null}
        {chip ? (
          <span className={clsx(styles.tilePriority, priorityBadgeClass(chip))}>{PRIORITY_VIEW[chip].short}</span>
        ) : null}
        {tile.due ? (
          <span className={tile.due.late ? styles.tileLate : styles.tileDue}>
            {compact ? tile.due.short : tile.due.text}
          </span>
        ) : null}
      </span>
    </button>
  );
}
