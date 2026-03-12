"use client";

import { Sparkles } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useApiMutation } from "@/hooks/use-api";
import { apiClient } from "@/hooks/use-api";

type GenerationResponse = Array<{
  branchId: string;
  branchName: string;
  productId: string;
  productName: string;
  taskId: string;
  title: string;
  taskStatus: string;
  priority: string;
  operation: string;
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
        description="Ручний запуск із адмінки створює demo-набір: 5-8 випадкових задач на кожну філію з різними пріоритетами. Автоматичний cron і далі використовує основний алгоритм."
      />

      <Card>
        <CardHeader>
          <CardTitle>Manual run</CardTitle>
          <CardDescription>
            Для демо-режиму генератор створює нові задачі по кожній філії та не порушує правило одного активного
            завдання на товар.
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
                  key={result.taskId}
                  className="grid gap-2 rounded-2xl border border-border/70 bg-muted/30 px-4 py-3 md:grid-cols-[1.4fr_1fr_auto_auto]"
                >
                  <div>
                    <p className="text-sm font-semibold">{result.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {result.branchName} • {result.productName}
                    </p>
                  </div>
                  <span className="text-sm text-muted-foreground">{result.operation}</span>
                  <Badge variant="outline">{result.taskStatus}</Badge>
                  <Badge>{result.priority}</Badge>
                </div>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
}
