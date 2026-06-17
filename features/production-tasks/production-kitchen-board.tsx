"use client";

import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { InstallPrompt } from "@/components/pwa/install-prompt";
import { getDepartmentName } from "@/domain/departments";
import { getFilialName } from "@/domain/filials";
import { apiClient, useApiMutation, useApiQuery } from "@/hooks/use-api";
import { formatCoverageParts } from "@/lib/format";
import styles from "./production-kitchen-board.module.css";

interface ProductionTask {
  id: string;
  filial_id: number;
  department_id: number | null;
  department_name: string | null;
  lager_id: number;
  lager_name: string | null;
  unit: string | null;
  snapshot_hour: number | null;
  history_date: string;
  status: "NEW" | "IN_PROGRESS" | "DONE" | "CANCELLED";
  priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  priority_level: number;
  quantity: number;
  covered_hours: number;
  current_stock_qty: number | null;
  reason: string;
  operational_ready_at: string | null;
  is_overdue: boolean;
}

interface ProductionTasksResponse {
  generated_at: string;
  count: number;
  tasks: ProductionTask[];
}

type PrioKey = "critical" | "high" | "medium";

// `variant` drives the CSS class suffix (prio/note/card tints); `label` is the
// Ukrainian text shown on the badge.
const PRIORITY_META: Record<
  ProductionTask["priority"],
  { key: PrioKey; variant: "Critical" | "High" | "Medium"; label: string }
> = {
  CRITICAL: { key: "critical", variant: "Critical", label: "Критичний" },
  HIGH: { key: "high", variant: "High", label: "Високий" },
  MEDIUM: { key: "medium", variant: "Medium", label: "Нормальний" },
  LOW: { key: "medium", variant: "Medium", label: "Нормальний" }
};

const STORAGE_KEY = "kitchen.selectedBranch";
const DEPARTMENT_STORAGE_KEY = "kitchen.selectedDepartment";
const VIEW_STORAGE_KEY = "kitchen.viewMode";
const STATUS_STORAGE_KEY = "kitchen.selectedStatus";
const PRIORITY_STORAGE_KEY = "kitchen.selectedPriority";

// Local-time YYYY-MM-DD for `offset` days from today.
function isoDateOffset(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function localDateStr(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dateFilterLabel(value: string): string {
  if (value === "all") return "Усі дати";
  if (value === isoDateOffset(0)) return "Сьогодні";
  if (value === isoDateOffset(1)) return "Завтра";
  if (value === isoDateOffset(2)) return "Післязавтра";
  const [y, m, d] = value.split("-");
  return `${d}.${m}.${y}`;
}

const CANNOT_PRODUCE_REASONS = [
  "Недостатньо сировини",
  "Немає електроенергії",
  "Немає потрібного обладнання",
  "Не вистачає персоналу"
];

function KebabIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="5" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="12" cy="19" r="1.8" />
    </svg>
  );
}

function BanIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <line x1="5.6" y1="5.6" x2="18.4" y2="18.4" />
    </svg>
  );
}

function GridIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="8" y1="6" x2="20" y2="6" />
      <line x1="8" y1="12" x2="20" y2="12" />
      <line x1="8" y1="18" x2="20" y2="18" />
      <circle cx="4" cy="6" r="1" />
      <circle cx="4" cy="12" r="1" />
      <circle cx="4" cy="18" r="1" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

type ViewMode = "grid" | "list";

function TaskCard({
  task,
  onChanged,
  now,
  view
}: {
  task: ProductionTask;
  onChanged: () => void;
  now: number;
  view: ViewMode;
}) {
  const meta = PRIORITY_META[task.priority];

  // Live remaining coverage:
  //   max(0, covered_hours + snapshot_hour − current_hour_float)
  // i.e. coverage left counting down from the snapshot moment.
  const nowDate = new Date(now);
  const currentHourFloat = nowDate.getHours() + nowDate.getMinutes() / 60 + nowDate.getSeconds() / 3600;
  const coverageHours =
    task.snapshot_hour != null
      ? Math.max(0, task.covered_hours + task.snapshot_hour - currentHourFloat)
      : task.covered_hours;
  const coverage = formatCoverageParts(coverageHours);

  // Operational readiness deadline (forecast receipt + covered_hours) and
  // whether the task is still on time relative to the live clock.
  const readyAt = task.operational_ready_at ? new Date(task.operational_ready_at) : null;
  const overdue = readyAt ? readyAt.getTime() < now : false;

  const start = useApiMutation({
    mutationFn: () => apiClient(`/api/production-tasks/${task.id}/start`, { method: "POST" }),
    successMessage: "Задачу взято в роботу",
    onSuccess: onChanged
  });

  const complete = useApiMutation({
    mutationFn: () => apiClient(`/api/production-tasks/${task.id}/complete`, { method: "POST" }),
    successMessage: "Задачу виконано",
    onSuccess: onChanged
  });

  const cancel = useApiMutation<unknown, string>({
    mutationFn: (reason: string) =>
      apiClient(`/api/production-tasks/${task.id}/cancel`, {
        method: "POST",
        body: JSON.stringify({ reason })
      }),
    successMessage: "Задачу позначено як неможливу до виготовлення",
    onSuccess: onChanged
  });

  const [menuOpen, setMenuOpen] = useState(false);
  const [reasonOpen, setReasonOpen] = useState(false);

  const busy = start.isPending || complete.isPending || cancel.isPending;
  const inProgress = task.status === "IN_PROGRESS";

  const noteClass = [styles.note, styles[`note${meta.variant}` as keyof typeof styles] as string]
    .filter(Boolean)
    .join(" ");
  const prioClass = [styles.prio, styles[`prio${meta.variant}` as keyof typeof styles] as string]
    .filter(Boolean)
    .join(" ");
  const cardClass = [styles.card, styles[`card${meta.variant}` as keyof typeof styles] as string]
    .filter(Boolean)
    .join(" ");
  const rowClass = [styles.row, styles[`row${meta.variant}` as keyof typeof styles] as string]
    .filter(Boolean)
    .join(" ");

  const badge = inProgress ? (
    <span className={styles.progressTag}>В роботі</span>
  ) : (
    <span className={prioClass}>{meta.label}</span>
  );

  const kebab = (
    <div className={styles.kebabWrap}>
      <button
        type="button"
        className={styles.kebab}
        aria-label="Дії"
        onClick={() => setMenuOpen((open) => !open)}
      >
        <KebabIcon />
      </button>
      {menuOpen ? (
        <>
          <div className={styles.menuBackdrop} onClick={() => setMenuOpen(false)} />
          <div className={styles.kebabMenu}>
            <button
              type="button"
              className={styles.kebabItem}
              onClick={() => {
                setMenuOpen(false);
                setReasonOpen(true);
              }}
            >
              <BanIcon />
              Неможливо виготовити
            </button>
          </div>
        </>
      ) : null}
    </div>
  );

  const actionButton = inProgress ? (
    <button
      type="button"
      className={`${styles.btnStart} ${styles.btnComplete}`}
      onClick={() => complete.mutate()}
      disabled={busy}
    >
      <span className={styles.play}>
        <CheckIcon />
      </span>
      Завершити
    </button>
  ) : (
    <button type="button" className={styles.btnStart} onClick={() => start.mutate()} disabled={busy}>
      <span className={styles.play}>
        <PlayIcon />
      </span>
      Почати
    </button>
  );

  const modal = reasonOpen ? (
    <div className={styles.modalOverlay} onClick={() => setReasonOpen(false)}>
      <div className={styles.modal} onClick={(event) => event.stopPropagation()}>
        <p className={styles.modalTitle}>Вкажіть причину</p>
        <p className={styles.modalSub}>{task.lager_name ?? `Lager ${task.lager_id}`}</p>
        <div className={styles.reasonList}>
          {CANNOT_PRODUCE_REASONS.map((reason) => (
            <button
              key={reason}
              type="button"
              className={styles.reasonBtn}
              disabled={busy}
              onClick={() => cancel.mutate(reason, { onSuccess: () => setReasonOpen(false) })}
            >
              {reason}
            </button>
          ))}
        </div>
        <button type="button" className={styles.modalCancel} onClick={() => setReasonOpen(false)}>
          Скасувати
        </button>
      </div>
    </div>
  ) : null;

  const stock =
    task.current_stock_qty != null ? Math.round(task.current_stock_qty * 10) / 10 : null;

  // ─── List (row) layout ───
  if (view === "list") {
    return (
      <article className={rowClass}>
        <div className={styles.rowMain}>
          <p className={styles.rowTitle}>{task.lager_name ?? `Lager ${task.lager_id}`}</p>
          <p className={styles.rowMeta}>
            SKU {task.lager_id}
            <span className={styles.sep}>•</span>
            {getFilialName(task.filial_id)}
            <span className={styles.sep}>•</span>
            {task.history_date}
          </p>
        </div>

        {badge}

        <div className={styles.rowMetric}>
          <span className={styles.metricLabel}>Виробити</span>
          <span className={styles.rowMetricValue}>
            {task.quantity}
            <span className={styles.unit}>{task.unit ?? "кг"}</span>
          </span>
        </div>
        <div className={styles.rowMetric}>
          <span className={styles.metricLabel}>Покриття</span>
          <span className={styles.rowMetricValue}>
            {coverage.value}
            <span className={styles.unit}>{coverage.unit}</span>
          </span>
        </div>
        <div className={styles.rowMetric}>
          <span className={styles.metricLabel}>Залишок</span>
          <span className={styles.rowMetricValue}>
            {stock ?? "—"}
            {stock != null ? <span className={styles.unit}>{task.unit ?? "кг"}</span> : null}
          </span>
        </div>

        <div className={styles.rowReadiness}>
          {readyAt ? (
            <>
              <span className={styles.readinessTime}>{formatReadyAt(readyAt)}</span>
              <span className={overdue ? styles.statusOverdue : styles.statusOnTime}>
                {overdue ? "Прострочено" : "Вчасно"}
              </span>
            </>
          ) : null}
        </div>

        <div className={styles.rowActions}>
          {actionButton}
          {kebab}
        </div>

        {modal}
      </article>
    );
  }

  // ─── Grid (card) layout ───
  return (
    <article className={cardClass}>
      <div className={styles.cardHead}>
        <h2 className={styles.cardTitle}>{task.lager_name ?? `Lager ${task.lager_id}`}</h2>
        <div className={styles.headActions}>
          {badge}
          {kebab}
        </div>
      </div>

      <p className={styles.cardMeta}>
        SKU {task.lager_id}
        <span className={styles.sep}>•</span>
        {getFilialName(task.filial_id)}
        <span className={styles.sep}>•</span>
        {task.history_date}
      </p>

      <div className={styles.metrics}>
        <div className={styles.metric}>
          <span className={styles.metricLabel}>Виробити</span>
          <span className={styles.metricValue}>
            {task.quantity}
            <span className={styles.unit}>{task.unit ?? "кг"}</span>
          </span>
        </div>
        <div className={styles.metric}>
          <span className={styles.metricLabel}>Покриття</span>
          <span className={styles.metricValue}>
            {coverage.value}
            <span className={styles.unit}>{coverage.unit}</span>
          </span>
        </div>
      </div>

      {stock != null ? (
        <p className={styles.stockLine}>
          <span>Залишок на складі</span>
          <span className={styles.stockValue}>
            {stock}
            <span className={styles.unit}>{task.unit ?? "кг"}</span>
          </span>
        </p>
      ) : null}

      {readyAt ? (
        <div className={styles.readiness}>
          <span className={styles.readinessInfo}>
            Готовність до <span className={styles.readinessTime}>{formatReadyAt(readyAt)}</span>
          </span>
          <span className={overdue ? styles.statusOverdue : styles.statusOnTime}>
            {overdue ? "Прострочено" : "Вчасно"}
          </span>
        </div>
      ) : null}

      <p className={noteClass}>{task.reason}</p>

      {actionButton}
      {modal}
    </article>
  );
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

// "HH:mm" for today, "dd.MM HH:mm" otherwise.
function formatReadyAt(date: Date) {
  const hhmm = `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
  const today = new Date();
  const sameDay =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();
  return sameDay ? hhmm : `${pad2(date.getDate())}.${pad2(date.getMonth() + 1)} ${hhmm}`;
}

function Clock() {
  // System time, updated every second on the client. Starts null to avoid an
  // SSR/client hydration mismatch, then fills in on mount.
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!now) {
    return <div className={styles.clock} aria-hidden />;
  }

  const hhmm = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
  const ss = pad2(now.getSeconds());

  return (
    <div className={styles.clock} role="timer" aria-label={`${hhmm}:${ss}`}>
      <span className={styles.clockMain}>{hhmm}</span>
      <span className={styles.clockSeconds}>{ss}</span>
    </div>
  );
}

export function ProductionKitchenBoard() {
  const [selectedBranch, setSelectedBranch] = useState("all");
  const [selectedDepartment, setSelectedDepartment] = useState("all");
  const [selectedDate, setSelectedDate] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [selectedPriority, setSelectedPriority] = useState("all");
  const [dateMenuOpen, setDateMenuOpen] = useState(false);
  const [view, setView] = useState<ViewMode>("grid");
  const [now, setNow] = useState(() => Date.now());

  // Tick so the on-time / overdue status flips live without a refetch.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(id);
  }, []);

  // Restore the operator's branch / department choice for the session.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const branch = window.localStorage.getItem(STORAGE_KEY);
    if (branch) setSelectedBranch(branch);
    const department = window.localStorage.getItem(DEPARTMENT_STORAGE_KEY);
    if (department) setSelectedDepartment(department);
    const storedView = window.localStorage.getItem(VIEW_STORAGE_KEY);
    if (storedView === "grid" || storedView === "list") setView(storedView);
    const status = window.localStorage.getItem(STATUS_STORAGE_KEY);
    if (status) setSelectedStatus(status);
    const priority = window.localStorage.getItem(PRIORITY_STORAGE_KEY);
    if (priority) setSelectedPriority(priority);
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(VIEW_STORAGE_KEY, view);
    }
  }, [view]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STATUS_STORAGE_KEY, selectedStatus);
    }
  }, [selectedStatus]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(PRIORITY_STORAGE_KEY, selectedPriority);
    }
  }, [selectedPriority]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, selectedBranch);
    }
  }, [selectedBranch]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(DEPARTMENT_STORAGE_KEY, selectedDepartment);
    }
  }, [selectedDepartment]);

  const queryClient = useQueryClient();
  const query = useApiQuery<ProductionTasksResponse>(
    ["production-tasks", "kitchen"],
    "/api/production-tasks",
    // Polling is only a fallback; live updates arrive instantly over SSE below.
    { refetchInterval: 20000 }
  );

  // Real-time updates: subscribe to the server-sent event stream and refresh
  // the moment a forecast is ingested or any task changes status. Reconnects
  // automatically (EventSource), and a refresh on reconnect catches missed events.
  useEffect(() => {
    if (typeof window === "undefined" || typeof EventSource === "undefined") {
      return undefined;
    }

    const source = new EventSource("/api/production-tasks/stream");
    let hasOpened = false;

    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: ["production-tasks"] });
    };

    const handleUpdate = () => refresh();
    const handleOpen = () => {
      if (hasOpened) refresh();
      hasOpened = true;
    };

    source.addEventListener("production-tasks-updated", handleUpdate);
    source.addEventListener("open", handleOpen);

    return () => {
      source.removeEventListener("production-tasks-updated", handleUpdate);
      source.removeEventListener("open", handleOpen);
      source.close();
    };
  }, [queryClient]);

  const allTasks = query.data?.tasks ?? [];

  const activeTasks = useMemo(
    () => allTasks.filter((task) => task.status === "NEW" || task.status === "IN_PROGRESS"),
    [allTasks]
  );

  // Options come from the active tasks, plus the currently-selected value so a
  // saved filter always stays visible/applied — even while data is still
  // loading or when that branch/department temporarily has no active tasks.
  // (No auto-reset to "all", so the operator's choice persists across reloads
  // and deploys.)
  const branchOptions = useMemo(() => {
    const ids = new Set<number>(activeTasks.map((task) => task.filial_id));
    if (selectedBranch !== "all") {
      const id = Number(selectedBranch);
      if (Number.isFinite(id)) ids.add(id);
    }
    return Array.from(ids).sort((a, b) => a - b);
  }, [activeTasks, selectedBranch]);

  const departmentOptions = useMemo(() => {
    const ids = new Set<number>(
      activeTasks.map((task) => task.department_id).filter((id): id is number => id != null)
    );
    if (selectedDepartment !== "all") {
      const id = Number(selectedDepartment);
      if (Number.isFinite(id)) ids.add(id);
    }
    return Array.from(ids).sort((a, b) => a - b);
  }, [activeTasks, selectedDepartment]);

  const filtered = activeTasks.filter((task) => {
    if (selectedBranch !== "all" && String(task.filial_id) !== selectedBranch) return false;
    if (selectedDepartment !== "all" && String(task.department_id) !== selectedDepartment) return false;
    if (selectedStatus !== "all" && task.status !== selectedStatus) return false;
    if (selectedPriority !== "all") {
      // "Нормальний" (MEDIUM) also covers LOW, which displays as Нормальний.
      const matches =
        task.priority === selectedPriority ||
        (selectedPriority === "MEDIUM" && task.priority === "LOW");
      if (!matches) return false;
    }
    if (selectedDate !== "all") {
      const deadline = task.operational_ready_at ? localDateStr(new Date(task.operational_ready_at)) : null;
      if (deadline !== selectedDate) return false;
    }
    return true;
  });

  // Sort by operational readiness deadline ascending — the soonest (and
  // already overdue) deadlines float to the top; tasks without one go last.
  const tasks = useMemo(() => {
    const deadline = (task: ProductionTask) =>
      task.operational_ready_at ? new Date(task.operational_ready_at).getTime() : Number.POSITIVE_INFINITY;
    return [...filtered].sort((a, b) => deadline(a) - deadline(b));
  }, [filtered]);

  return (
    <>
      <InstallPrompt />
      <main className={styles.shell}>
      <header className={styles.topbar}>
        <div>
          <Clock />
        </div>

        <div className={styles.controls}>
          <div className={styles.viewToggle} role="group" aria-label="Вигляд">
            <button
              type="button"
              className={view === "grid" ? styles.viewToggleActive : styles.viewToggleBtn}
              aria-label="Плитки"
              aria-pressed={view === "grid"}
              onClick={() => setView("grid")}
            >
              <GridIcon />
            </button>
            <button
              type="button"
              className={view === "list" ? styles.viewToggleActive : styles.viewToggleBtn}
              aria-label="Список"
              aria-pressed={view === "list"}
              onClick={() => setView("list")}
            >
              <ListIcon />
            </button>
          </div>

          <span className={styles.statusPill} title="Інтерфейс оптимізовано під роздільну здатність 1340×800">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="6" y="3" width="12" height="18" rx="2.5" />
              <line x1="11" y1="18" x2="13" y2="18" />
            </svg>
            1340×800 optimized
          </span>

          <a className={styles.ghostBtn} href="/guide">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5V4.5z" />
              <path d="M4 4.5V21.5A2.5 2.5 0 0 1 6.5 19H20" />
            </svg>
            Інструкція
          </a>
        </div>
      </header>

      <div className={styles.filters}>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Філія</span>
          <select
            className={styles.fieldSelect}
            aria-label="Філія"
            value={selectedBranch}
            onChange={(event) => setSelectedBranch(event.target.value)}
          >
            <option value="all">Усі філії</option>
            {branchOptions.map((id) => (
              <option key={id} value={String(id)}>
                {getFilialName(id)}
              </option>
            ))}
          </select>
          <span className={styles.fieldChevron}>
            <ChevronIcon />
          </span>
        </div>

        <div className={styles.field}>
          <span className={styles.fieldLabel}>Відділ</span>
          <select
            className={styles.fieldSelect}
            aria-label="Відділ"
            value={selectedDepartment}
            onChange={(event) => setSelectedDepartment(event.target.value)}
          >
            <option value="all">Усі відділи</option>
            {departmentOptions.map((id) => (
              <option key={id} value={String(id)}>
                {getDepartmentName(id) ?? `Відділ ${id}`}
              </option>
            ))}
          </select>
          <span className={styles.fieldChevron}>
            <ChevronIcon />
          </span>
        </div>

        <div className={styles.dateFieldWrap}>
          <button
            type="button"
            className={styles.field}
            onClick={() => setDateMenuOpen((open) => !open)}
          >
            <span className={styles.fieldLabel}>Дата</span>
            <span className={styles.dateValue}>{dateFilterLabel(selectedDate)}</span>
            <span className={styles.fieldChevron}>
              <ChevronIcon />
            </span>
          </button>
          {dateMenuOpen ? (
            <>
              <div className={styles.menuBackdrop} onClick={() => setDateMenuOpen(false)} />
              <div className={styles.datePopover}>
                {[
                  { label: "Усі дати", value: "all" },
                  { label: "Сьогодні", value: isoDateOffset(0) },
                  { label: "Завтра", value: isoDateOffset(1) },
                  { label: "Післязавтра", value: isoDateOffset(2) }
                ].map((opt) => (
                  <button
                    key={opt.label}
                    type="button"
                    className={selectedDate === opt.value ? styles.dateQuickActive : styles.dateQuick}
                    onClick={() => {
                      setSelectedDate(opt.value);
                      setDateMenuOpen(false);
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
                <label className={styles.dateCustom}>
                  Інша дата
                  <input
                    type="date"
                    className={styles.dateInput}
                    value={selectedDate === "all" ? "" : selectedDate}
                    onChange={(event) => {
                      setSelectedDate(event.target.value || "all");
                      setDateMenuOpen(false);
                    }}
                  />
                </label>
              </div>
            </>
          ) : null}
        </div>

        <div className={styles.segment} role="group" aria-label="Статус">
          {[
            { label: "Усі", value: "all" },
            { label: "До виконання", value: "NEW" },
            { label: "В роботі", value: "IN_PROGRESS" }
          ].map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={selectedStatus === opt.value ? styles.segmentActive : styles.segmentBtn}
              aria-pressed={selectedStatus === opt.value}
              onClick={() => setSelectedStatus(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className={styles.field}>
          <span className={styles.fieldLabel}>Пріоритет</span>
          <select
            className={styles.fieldSelect}
            aria-label="Пріоритет"
            value={selectedPriority}
            onChange={(event) => setSelectedPriority(event.target.value)}
          >
            <option value="all">Усі пріоритети</option>
            <option value="CRITICAL">Критичний</option>
            <option value="HIGH">Високий</option>
            <option value="MEDIUM">Нормальний</option>
          </select>
          <span className={styles.fieldChevron}>
            <ChevronIcon />
          </span>
        </div>
      </div>

      {query.isLoading ? (
        <section className={styles.grid} aria-label="Завантаження">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className={styles.skeletonCard}>
              <div className={styles.shimmer} style={{ height: 20, width: "70%" }} />
              <div className={styles.shimmer} style={{ height: 14, width: "90%" }} />
              <div className={styles.shimmer} style={{ height: 56 }} />
              <div className={styles.shimmer} style={{ height: 42, marginTop: 8 }} />
              <div className={styles.shimmer} style={{ height: 44, borderRadius: 999 }} />
            </div>
          ))}
        </section>
      ) : query.isError ? (
        <div className={styles.stateBox}>
          <div className={styles.stateIcon}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <line x1="12" y1="8" x2="12" y2="13" />
              <line x1="12" y1="16.5" x2="12" y2="16.5" />
            </svg>
          </div>
          <h2 className={styles.stateTitle}>Не вдалося завантажити задачі</h2>
          <p className={styles.stateText}>Спробуйте оновити сторінку.</p>
          <button type="button" className={styles.btnStart} style={{ width: "auto" }} onClick={() => query.refetch()}>
            Оновити
          </button>
        </div>
      ) : tasks.length ? (
        <section
          className={view === "list" ? styles.list : styles.grid}
          aria-label="Список виробничих задач"
        >
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} now={now} view={view} onChanged={() => query.refetch()} />
          ))}
        </section>
      ) : (
        <div className={styles.stateBox}>
          <div className={styles.stateIcon}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12h4l2 5 4-10 2 5h6" />
            </svg>
          </div>
          <h2 className={styles.stateTitle}>Зараз немає виробничих задач</h2>
          <p className={styles.stateText}>
            {activeTasks.length
              ? "Оберіть іншу філію або дочекайтесь нових задач для поточної."
              : "Коли надійде прогноз через API, задачі одразу з'являться на цьому екрані."}
          </p>
        </div>
      )}
      </main>
    </>
  );
}
