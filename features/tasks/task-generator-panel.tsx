"use client";

import { Sparkles } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useApiMutation } from "@/hooks/use-api";
import { apiClient } from "@/hooks/use-api";

// Summary of the real production pipeline (services/production-tasks).
interface GenerationSummary {
  created: number;
  updated: number;
  cancelled: number;
  skipped: number;
  unchanged: number;
  total: number;
}

const SUMMARY_LABELS: Array<{ key: keyof GenerationSummary; label: string; hint: string }> = [
  { key: "created", label: "Створено", hint: "нові задачі з прогнозу" },
  { key: "updated", label: "Оновлено", hint: "включно з пере-відкритими" },
  { key: "cancelled", label: "Скасовано", hint: "запас покриває попит" },
  { key: "unchanged", label: "Без змін", hint: "в роботі або виконані" },
  { key: "skipped", label: "Пропущено", hint: "без потреби у виробництві" },
  { key: "total", label: "Рядків прогнозу", hint: "усього опрацьовано" }
];

export function TaskGeneratorPanel() {
  const mutation = useApiMutation<GenerationSummary>({
    mutationFn: () =>
      apiClient<GenerationSummary>("/api/production-tasks/generate", {
        method: "POST"
      }),
    successMessage: "Генерацію виконано",
    invalidateKeys: [["production-tasks"], ["tasks"], ["dashboard"]]
  });

  const summary = mutation.data;

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Task generation"
        title="Генерація задач"
        description="Перегенеровує виробничі задачі з останнього збереженого прогнозу по всіх філіях — тим самим алгоритмом, що і автоматична генерація при надходженні прогнозу."
      />

      <Card>
        <CardHeader>
          <CardTitle>Ручний запуск</CardTitle>
          <CardDescription>
            Задачі в роботі та виконані не змінюються; виконані пере-відкриваються лише коли свіжий
            знімок складу підтверджує дефіцит. Якщо прогнозів у базі немає — генерувати нема з чого.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            <Sparkles className="mr-2 h-4 w-4" />
            {mutation.isPending ? "Генерується…" : "Запустити генерацію зараз"}
          </Button>

          {summary ? (
            summary.total === 0 ? (
              <p className="text-sm text-muted-foreground">
                У базі немає жодного рядка прогнозу — задачі не створено. Надішліть прогноз через
                POST /api/production-plan-priority.
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {SUMMARY_LABELS.map(({ key, label, hint }) => (
                  <div
                    key={key}
                    className="rounded-2xl border border-border/70 bg-muted/30 px-4 py-3"
                  >
                    <p className="text-2xl font-semibold tabular-nums">{summary[key]}</p>
                    <p className="text-sm font-medium">{label}</p>
                    <p className="text-xs text-muted-foreground">{hint}</p>
                  </div>
                ))}
              </div>
            )
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
}
