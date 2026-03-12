"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { settingsSchema } from "@/api/schemas";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FormError } from "@/components/ui/form-error";
import { FormGrid } from "@/components/ui/form-grid";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingState } from "@/components/ui/loading-state";
import { apiClient, useApiMutation, useApiQuery } from "@/hooks/use-api";
import type { SettingsDto } from "@/types";

type SettingsFormValues = z.infer<typeof settingsSchema>;

export function SettingsManagement() {
  const settings = useApiQuery<SettingsDto>(["settings"], "/api/settings");
  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      companyName: "",
      planningHorizonHours: 4,
      generationIntervalMinutes: 15,
      kitchenBoardRefreshSec: 30
    }
  });

  useEffect(() => {
    if (settings.data) {
      form.reset({
        companyName: settings.data.companyName,
        planningHorizonHours: settings.data.planningHorizonHours,
        generationIntervalMinutes: settings.data.generationIntervalMinutes,
        kitchenBoardRefreshSec: settings.data.kitchenBoardRefreshSec
      });
    }
  }, [form, settings.data]);

  const mutation = useApiMutation({
    mutationFn: (values: SettingsFormValues) =>
      apiClient<SettingsDto>("/api/settings", {
        method: "PUT",
        body: JSON.stringify(values)
      }),
    successMessage: "Налаштування збережено",
    invalidateKeys: [["settings"]]
  });

  if (settings.isLoading) {
    return <LoadingState />;
  }

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="System settings"
        title="Налаштування"
        description="Керуйте параметрами горизонту планування, інтервалом генерації та поведінкою kitchen board."
      />

      <Card>
        <CardContent className="pt-6">
          <form className="space-y-5" onSubmit={form.handleSubmit((values) => mutation.mutate(values))}>
            <div className="space-y-2">
              <Label htmlFor="company-name">Назва компанії</Label>
              <Input id="company-name" {...form.register("companyName")} />
              <FormError message={form.formState.errors.companyName?.message} />
            </div>

            <FormGrid className="md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="planning-horizon">Горизонт планування, год</Label>
                <Input id="planning-horizon" type="number" min={1} max={12} {...form.register("planningHorizonHours")} />
                <FormError message={form.formState.errors.planningHorizonHours?.message} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="generation-interval">Інтервал генерації, хв</Label>
                <Input
                  id="generation-interval"
                  type="number"
                  min={5}
                  max={60}
                  {...form.register("generationIntervalMinutes")}
                />
                <FormError message={form.formState.errors.generationIntervalMinutes?.message} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="kitchen-refresh">Оновлення tablet UI, сек</Label>
                <Input
                  id="kitchen-refresh"
                  type="number"
                  min={10}
                  max={300}
                  {...form.register("kitchenBoardRefreshSec")}
                />
                <FormError message={form.formState.errors.kitchenBoardRefreshSec?.message} />
              </div>
            </FormGrid>

            <Button type="submit" disabled={mutation.isPending}>
              Зберегти налаштування
            </Button>
          </form>
        </CardContent>
      </Card>
    </section>
  );
}
