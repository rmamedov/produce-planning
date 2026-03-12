"use client";

import { Sparkles } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useApiMutation } from "@/hooks/use-api";
import { apiClient } from "@/hooks/use-api";

type GenerationResponse = Array<{
  status: string;
  taskId?: string | null;
  assortmentItemId: string;
}>;

export function TaskGeneratorPanel() {
  const mutation = useApiMutation({
    mutationFn: () =>
      apiClient<GenerationResponse>("/api/tasks/generate", {
        method: "POST"
      }),
    successMessage: "Генератор задач виконано",
    invalidateKeys: [["tasks"], ["dashboard"]]
  });

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Task generation"
        title="Генерація задач"
        description="Запустіть алгоритм вручну. У production цей ендпоінт має викликатися cron-ом кожні 15 хвилин."
      />

      <Card>
        <CardHeader>
          <CardTitle>Manual run</CardTitle>
          <CardDescription>
            Алгоритм використовує транзакції, row locking і partial unique index для branchId + productId + active
            status.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            <Sparkles className="mr-2 h-4 w-4" />
            Запустити генерацію зараз
          </Button>

          {mutation.data?.length ? (
            <div className="grid gap-3">
              {mutation.data.map((result) => (
                <div
                  key={`${result.assortmentItemId}-${result.taskId ?? "none"}`}
                  className="flex items-center justify-between rounded-2xl border border-border/70 bg-muted/30 px-4 py-3"
                >
                  <span className="text-sm text-muted-foreground">Assortment item: {result.assortmentItemId}</span>
                  <Badge>{result.status}</Badge>
                </div>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
}
