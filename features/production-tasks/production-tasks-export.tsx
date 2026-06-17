"use client";

import { useMemo, useState } from "react";
import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useApiQuery } from "@/hooks/use-api";

interface FilialRow {
  filial_id: number;
  filial_name: string;
}

interface AnalyticsResponse {
  by_filial: FilialRow[];
}

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "NEW", label: "До виконання" },
  { value: "IN_PROGRESS", label: "В роботі" },
  { value: "DONE", label: "Виконано" },
  { value: "CANCELLED", label: "Скасовано" }
];

export function ProductionTasksExport() {
  const analytics = useApiQuery<AnalyticsResponse>(["production-analytics"], "/api/production-analytics");

  const filials = useMemo(
    () => (analytics.data?.by_filial ?? []).slice().sort((a, b) => a.filial_id - b.filial_id),
    [analytics.data]
  );

  const [selectedFilials, setSelectedFilials] = useState<Set<number>>(new Set());
  const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(new Set());
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const toggle = <T,>(set: Set<T>, value: T): Set<T> => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  };

  function handleDownload() {
    const params = new URLSearchParams();
    // Empty selection = all (omit the param).
    if (selectedFilials.size && selectedFilials.size !== filials.length) {
      params.set("filial_id", Array.from(selectedFilials).join(","));
    }
    if (selectedStatuses.size && selectedStatuses.size !== STATUS_OPTIONS.length) {
      params.set("status", Array.from(selectedStatuses).join(","));
    }
    if (from) params.set("from", from);
    if (to) params.set("to", to);

    const qs = params.toString();
    window.open(`/api/production-tasks/export${qs ? `?${qs}` : ""}`, "_blank");
  }

  const labelClass =
    "flex cursor-pointer items-center gap-2 rounded-xl border border-border/70 px-3 py-2 text-sm hover:bg-muted/40";
  const inputClass =
    "flex h-11 rounded-2xl border border-input bg-white px-4 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Вивантаження в Excel</CardTitle>
        <CardDescription>
          Експорт виробничих задач з усіма полями та статусами у файл XLSX. Без вибору — береться все.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Філії</p>
            <div className="grid max-h-56 grid-cols-1 gap-2 overflow-auto pr-1 sm:grid-cols-2">
              {filials.length === 0 ? (
                <p className="text-sm text-muted-foreground">Завантаження філій…</p>
              ) : (
                filials.map((f) => (
                  <label key={f.filial_id} className={labelClass}>
                    <input
                      type="checkbox"
                      checked={selectedFilials.has(f.filial_id)}
                      onChange={() => setSelectedFilials((s) => toggle(s, f.filial_id))}
                    />
                    <span className="truncate">{f.filial_name}</span>
                  </label>
                ))
              )}
            </div>
            <p className="text-xs text-muted-foreground">Нічого не вибрано — усі філії.</p>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Статуси</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {STATUS_OPTIONS.map((s) => (
                <label key={s.value} className={labelClass}>
                  <input
                    type="checkbox"
                    checked={selectedStatuses.has(s.value)}
                    onChange={() => setSelectedStatuses((set) => toggle(set, s.value))}
                  />
                  <span>{s.label}</span>
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Нічого не вибрано — усі статуси.</p>

            <p className="pt-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Дата створення задачі
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Від</label>
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputClass} />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">До</label>
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputClass} />
              </div>
            </div>
          </div>
        </div>

        <Button onClick={handleDownload}>
          <Download className="mr-2 h-4 w-4" />
          Вивантажити XLSX
        </Button>
      </CardContent>
    </Card>
  );
}
