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
  history_date: string;
  status: "NEW" | "IN_PROGRESS" | "DONE" | "CANCELLED";
  priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  priority_level: number;
  quantity: number;
  covered_hours: number;
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

const PRIORITY_META: Record<ProductionTask["priority"], { key: PrioKey; label: string }> = {
  CRITICAL: { key: "critical", label: "Critical" },
  HIGH: { key: "high", label: "High" },
  MEDIUM: { key: "medium", label: "Medium" },
  LOW: { key: "medium", label: "Medium" }
};

const STORAGE_KEY = "kitchen.selectedBranch";
const DEPARTMENT_STORAGE_KEY = "kitchen.selectedDepartment";

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

function TaskCard({ task, onChanged, now }: { task: ProductionTask; onChanged: () => void; now: number }) {
  const meta = PRIORITY_META[task.priority];
  const coverage = formatCoverageParts(task.covered_hours);

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

  const busy = start.isPending || complete.isPending;
  const inProgress = task.status === "IN_PROGRESS";

  const noteClass = [styles.note, styles[`note${meta.label}` as keyof typeof styles] as string]
    .filter(Boolean)
    .join(" ");
  const prioClass = [styles.prio, styles[`prio${meta.label}` as keyof typeof styles] as string]
    .filter(Boolean)
    .join(" ");

  return (
    <article className={styles.card}>
      <div className={styles.cardHead}>
        <h2 className={styles.cardTitle}>{task.lager_name ?? `Lager ${task.lager_id}`}</h2>
        {inProgress ? (
          <span className={styles.progressTag}>В роботі</span>
        ) : (
          <span className={prioClass}>{meta.label}</span>
        )}
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

      {inProgress ? (
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
        <button
          type="button"
          className={styles.btnStart}
          onClick={() => start.mutate()}
          disabled={busy}
        >
          <span className={styles.play}>
            <PlayIcon />
          </span>
          Почати
        </button>
      )}
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
  }, []);

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

  const branchOptions = useMemo(
    () => Array.from(new Set(activeTasks.map((task) => task.filial_id))).sort((a, b) => a - b),
    [activeTasks]
  );

  const departmentOptions = useMemo(
    () =>
      Array.from(
        new Set(
          activeTasks
            .map((task) => task.department_id)
            .filter((id): id is number => id != null)
        )
      ).sort((a, b) => a - b),
    [activeTasks]
  );

  useEffect(() => {
    if (selectedBranch !== "all" && !branchOptions.some((id) => String(id) === selectedBranch)) {
      setSelectedBranch("all");
    }
  }, [selectedBranch, branchOptions]);

  useEffect(() => {
    if (selectedDepartment !== "all" && !departmentOptions.some((id) => String(id) === selectedDepartment)) {
      setSelectedDepartment("all");
    }
  }, [selectedDepartment, departmentOptions]);

  const filtered = activeTasks.filter(
    (task) =>
      (selectedBranch === "all" || String(task.filial_id) === selectedBranch) &&
      (selectedDepartment === "all" || String(task.department_id) === selectedDepartment)
  );

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
        <section className={styles.grid} aria-label="Список виробничих задач">
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} now={now} onChanged={() => query.refetch()} />
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
