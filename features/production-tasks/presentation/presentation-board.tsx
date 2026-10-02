"use client";

import { useCallback, useEffect, useMemo, useState, type JSX } from "react";
import { toast } from "sonner";

import { getFilialShortName } from "@/domain/filials";
import { apiClient } from "@/hooks/use-api";
import {
  buildLagerLanes,
  groupMatchesFilters,
  groupPresentationTasks,
  loadSummary,
  type TaskGroup
} from "@/lib/presentation-grouping";
import type { KitchenTask, Presentation } from "../types";
import { GroupCompleteModal, type CompleteItem } from "./group-complete-modal";
import { CannotModal, CellPopover, KebabMenu, SubsetModal } from "./presentation-layers";
import { PresentationPrep } from "./presentation-prep";
import { PresentationSheet, type SheetHandlers } from "./presentation-sheet";
import {
  WORDS,
  completedToastText,
  countLabel,
  formatClock,
  formatWindowHours,
  producedByFilial,
  qtyPair,
  scopeEyebrow,
  sliceByFilial,
  startedToastText
} from "./presentation-view";
import styles from "./presentation.module.css";

type Group = TaskGroup<KitchenTask>;

type Layer =
  | { kind: "kebab"; groupKey: string; anchor: HTMLElement }
  | { kind: "cell"; groupKey: string; filialId: number; anchor: HTMLElement };

type Modal =
  | { kind: "complete"; group: Group; members: KitchenTask[] }
  | { kind: "subset"; group: Group }
  | { kind: "cannot"; group: Group; members: KitchenTask[] };

interface BatchStartResponse {
  batch_id: string | null;
  started: string[];
  skipped: string[];
}

interface BatchRevertResponse {
  reverted: string[];
  skipped: string[];
}

function post<T>(url: string, body: unknown): Promise<T> {
  return apiClient<T>(url, { method: "POST", body: JSON.stringify(body) });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Не вдалося виконати дію";
}

/**
 * Waits for the board refetch, so a busy row or modal unlocks only on fresh
 * data: a stale NEW row would invite a second «Почати» and a false
 * «уже взяли на іншому планшеті». A failed refetch still unlocks.
 */
async function refresh(onChanged: () => Promise<unknown> | void): Promise<void> {
  try {
    await onChanged();
  } catch {
    // The last data stays on screen until the next poll.
  }
}

export function PresentationBoard({
  presentation,
  tasks,
  selectedStatus,
  selectedPriority,
  view,
  now,
  onChanged
}: {
  presentation: Presentation;
  tasks: KitchenTask[];
  selectedStatus: string;
  selectedPriority: string;
  view: "sheet" | "prep";
  now: number;
  /** Resolves once the refetch has landed. */
  onChanged: () => Promise<unknown> | void;
}): JSX.Element {
  const windowMinutes = presentation.window_minutes;
  const filialIds = presentation.filial_ids;

  const groups = useMemo(() => groupPresentationTasks(tasks, windowMinutes), [tasks, windowMinutes]);
  const visible = useMemo(
    () => groups.filter((group) => groupMatchesFilters(group, selectedStatus, selectedPriority)),
    [groups, selectedStatus, selectedPriority]
  );
  const lanes = useMemo(() => buildLagerLanes(visible, selectedPriority), [visible, selectedPriority]);

  const [layer, setLayer] = useState<Layer | null>(null);
  const [modal, setModal] = useState<Modal | null>(null);
  const [modalBusy, setModalBusy] = useState(false);
  const [busyKeys, setBusyKeys] = useState<ReadonlySet<string>>(() => new Set());

  const layerGroup = layer ? groups.find((group) => group.key === layer.groupKey) : undefined;
  const cellSlice =
    layer?.kind === "cell" && layerGroup
      ? sliceByFilial(layerGroup.members).find((slice) => slice.filialId === layer.filialId)
      : undefined;

  // A refetch or a filter change can remove (or re-key) the row or the filial
  // the layer is attached to; a detached anchor would leave it floating in place.
  useEffect(() => {
    if (layer && (!layerGroup || !layer.anchor.isConnected || (layer.kind === "cell" && !cellSlice))) {
      setLayer(null);
    }
  });

  const closeLayer = useCallback(() => setLayer(null), []);

  const markBusy = useCallback((key: string, busy: boolean) => {
    setBusyKeys((current) => {
      const next = new Set(current);
      if (busy) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);

  const undoStart = useCallback(
    async (taskIds: string[]) => {
      try {
        await post<BatchRevertResponse>("/api/production-tasks/batch/revert", { task_ids: taskIds });
        toast("Повернуто в «До виконання»");
      } catch (error) {
        toast.error(errorMessage(error));
      } finally {
        await refresh(onChanged);
      }
    },
    [onChanged]
  );

  const startMembers = useCallback(
    async (group: Group, members: KitchenTask[]) => {
      markBusy(group.key, true);
      try {
        const result = await post<BatchStartResponse>("/api/production-tasks/batch/start", {
          task_ids: members.map((member) => member.id)
        });
        if (result.started.length === 0) {
          toast.info(`${group.lagerName}: уже взяли в роботу на іншому планшеті`);
          return;
        }
        const started = new Set(result.started);
        const parts = sliceByFilial(members.filter((member) => started.has(member.id)));
        toast.success(startedToastText(group.lagerName, parts, result.skipped.length), {
          duration: 8000,
          action: { label: "Скасувати", onClick: () => void undoStart(result.started) }
        });
      } catch (error) {
        toast.error(errorMessage(error));
      } finally {
        await refresh(onChanged);
        markBusy(group.key, false);
      }
    },
    [markBusy, onChanged, undoStart]
  );

  const revertGroup = useCallback(
    async (group: Group) => {
      markBusy(group.key, true);
      try {
        const result = await post<BatchRevertResponse>("/api/production-tasks/batch/revert", {
          task_ids: group.members.map((member) => member.id)
        });
        if (result.reverted.length) toast.success(`Повернуто в «До виконання»: ${group.lagerName}`);
        else toast.info(`${group.lagerName}: партію вже завершили на іншому планшеті`);
      } catch (error) {
        toast.error(errorMessage(error));
      } finally {
        await refresh(onChanged);
        markBusy(group.key, false);
      }
    },
    [markBusy, onChanged]
  );

  const completeMembers = useCallback(
    async (group: Group, members: KitchenTask[], items: CompleteItem[], produced: number[]) => {
      setModalBusy(true);
      try {
        await post("/api/production-tasks/batch/complete", { items });
        toast.success(completedToastText(group.lagerName, producedByFilial(members, produced)));
      } catch (error) {
        toast.error(errorMessage(error));
      } finally {
        await refresh(onChanged);
        setModalBusy(false);
        setModal(null);
      }
    },
    [onChanged]
  );

  const cancelMembers = useCallback(
    async (group: Group, members: KitchenTask[], reason: string) => {
      setModalBusy(true);
      const cancelled: KitchenTask[] = [];
      try {
        // One request per task, in order, so a failure leaves a clear boundary.
        for (const member of members) {
          await post(`/api/production-tasks/${member.id}/cancel`, { reason });
          cancelled.push(member);
        }
      } catch (error) {
        toast.error(errorMessage(error));
      } finally {
        if (cancelled.length) {
          const names = Array.from(new Set(cancelled.map((member) => getFilialShortName(member.filial_id))));
          toast.success(`Неможливо виготовити: ${group.lagerName} · ${names.join(", ")} (${reason})`);
        }
        await refresh(onChanged);
        setModalBusy(false);
        setModal(null);
      }
    },
    [onChanged]
  );

  const handlers = useMemo<SheetHandlers>(
    () => ({
      onPrimary: (group) => {
        setLayer(null);
        if (group.status === "IN_PROGRESS") setModal({ kind: "complete", group, members: group.members });
        else void startMembers(group, group.members);
      },
      onKebab: (group, anchor) =>
        setLayer((current) =>
          current?.kind === "kebab" && current.groupKey === group.key ? null : { kind: "kebab", groupKey: group.key, anchor }
        ),
      onCell: (group, filialId, anchor) =>
        setLayer((current) =>
          current?.kind === "cell" && current.groupKey === group.key && current.filialId === filialId
            ? null
            : { kind: "cell", groupKey: group.key, filialId, anchor }
        )
    }),
    [startMembers]
  );

  const emptyTitle = groups.length
    ? "Немає партій за цими фільтрами"
    : `Для «${presentation.name}» зараз немає партій`;
  const emptyText = groups.length
    ? "Змініть статус або пріоритет, щоб побачити інші партії."
    : "Щойно надійде прогноз, партії зʼявляться тут автоматично.";

  return (
    <div className={styles.root}>
      <div className={styles.scopeHead}>
        <div className={styles.scopeText}>
          <p className={styles.eyebrow}>{scopeEyebrow(filialIds.length, windowMinutes, visible)}</p>
          <h2 className={styles.scopeTitle}>{presentation.name}</h2>
        </div>
        {visible.length ? <LoadStrip groups={visible} now={now} windowMinutes={windowMinutes} /> : null}
      </div>

      {visible.length === 0 ? (
        <div className={styles.empty}>
          <h3 className={styles.emptyTitle}>{emptyTitle}</h3>
          <p className={styles.emptyText}>{emptyText}</p>
        </div>
      ) : view === "prep" ? (
        <PresentationPrep filialIds={filialIds} windowMinutes={windowMinutes} groups={visible} now={now} />
      ) : (
        <PresentationSheet
          filialIds={filialIds}
          lanes={lanes}
          selectedPriority={selectedPriority}
          now={now}
          busyKeys={busyKeys}
          openMenuKey={layer?.kind === "kebab" ? layer.groupKey : null}
          openCell={layer?.kind === "cell" ? layer : null}
          handlers={handlers}
        />
      )}

      {layer?.kind === "kebab" && layerGroup ? (
        <KebabMenu
          group={layerGroup}
          anchor={layer.anchor}
          filialIds={filialIds}
          windowMinutes={windowMinutes}
          now={now}
          onClose={closeLayer}
          onSubset={() => {
            closeLayer();
            setModal({ kind: "subset", group: layerGroup });
          }}
          onRevert={() => {
            closeLayer();
            void revertGroup(layerGroup);
          }}
          onCannot={() => {
            closeLayer();
            setModal({ kind: "cannot", group: layerGroup, members: layerGroup.members });
          }}
        />
      ) : null}

      {layer?.kind === "cell" && layerGroup && cellSlice ? (
        <CellPopover
          group={layerGroup}
          slice={cellSlice}
          anchor={layer.anchor}
          windowMinutes={windowMinutes}
          now={now}
          busy={busyKeys.has(layerGroup.key)}
          onClose={closeLayer}
          onStart={() => {
            closeLayer();
            void startMembers(layerGroup, cellSlice.members);
          }}
          onComplete={() => {
            closeLayer();
            setModal({ kind: "complete", group: layerGroup, members: cellSlice.members });
          }}
          onCannot={() => {
            closeLayer();
            setModal({ kind: "cannot", group: layerGroup, members: cellSlice.members });
          }}
        />
      ) : null}

      {modal?.kind === "complete" ? (
        <GroupCompleteModal
          lagerName={modal.group.lagerName}
          unit={modal.group.unit}
          members={modal.members}
          now={now}
          busy={modalBusy}
          onCancel={() => setModal(null)}
          onConfirm={(items, produced) => void completeMembers(modal.group, modal.members, items, produced)}
        />
      ) : null}

      {modal?.kind === "subset" ? (
        <SubsetModal
          group={modal.group}
          now={now}
          busy={busyKeys.has(modal.group.key)}
          onClose={() => setModal(null)}
          onStart={(members) => {
            setModal(null);
            void startMembers(modal.group, members);
          }}
        />
      ) : null}

      {modal?.kind === "cannot" ? (
        <CannotModal
          lagerName={modal.group.lagerName}
          unit={modal.group.unit}
          members={modal.members}
          now={now}
          busy={modalBusy}
          onClose={() => setModal(null)}
          onConfirm={(members, reason) => void cancelMembers(modal.group, members, reason)}
        />
      ) : null}
    </div>
  );
}

function LoadStrip({
  groups,
  now,
  windowMinutes
}: {
  groups: TaskGroup<KitchenTask>[];
  now: number;
  windowMinutes: number;
}) {
  const load = loadSummary(groups, now, windowMinutes);
  return (
    <div className={styles.load}>
      <div className={styles.loadSegNow}>
        <span className={styles.loadLabel}>
          Стартують до {formatClock(now + windowMinutes * 60000, now)} ({formatWindowHours(windowMinutes)})
        </span>
        <span className={styles.loadValue}>
          {countLabel(load.soon.count, WORDS.batch)} · {qtyPair(load.soon.pcs, load.soon.kg)}
        </span>
      </div>
      {load.later.count > 0 ? (
        <div className={styles.loadSeg}>
          <span className={styles.loadLabel}>Пізніше</span>
          <span className={styles.loadValue}>
            {countLabel(load.later.count, WORDS.batch)} · {qtyPair(load.later.pcs, load.later.kg)}
          </span>
        </div>
      ) : null}
      {load.overdue > 0 ? (
        <div className={styles.loadSegLate}>
          <span className={styles.loadLabel}>З них прострочено</span>
          <span className={styles.loadValue}>{countLabel(load.overdue, WORDS.batch)}</span>
        </div>
      ) : null}
    </div>
  );
}
