"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ColumnDef } from "@tanstack/react-table";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { forecastSchema } from "@/api/schemas";
import { DataTable } from "@/components/admin/data-table";
import { EntityPageShell } from "@/components/admin/entity-page-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { FormError } from "@/components/ui/form-error";
import { FormGrid } from "@/components/ui/form-grid";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingState } from "@/components/ui/loading-state";
import { Select } from "@/components/ui/select";
import { apiClient, useApiMutation, useApiQuery } from "@/hooks/use-api";
import { useReferenceData } from "@/hooks/use-reference-data";
import { toDateTimeLocalInputValue } from "@/lib/datetime";
import { formatDateTime } from "@/lib/format";
import type { ForecastDto } from "@/types";

type ForecastFormValues = z.infer<typeof forecastSchema>;

const defaultValues: ForecastFormValues = {
  branchId: "",
  productId: "",
  hour: new Date().toISOString(),
  forecastedSalesQty: 0
};

export function ForecastsManagement() {
  const [selectedForecast, setSelectedForecast] = useState<ForecastDto | null>(null);
  const forecasts = useApiQuery<ForecastDto[]>(["forecasts"], "/api/forecasts");
  const { branches, products } = useReferenceData();

  const form = useForm<ForecastFormValues>({
    resolver: zodResolver(forecastSchema),
    defaultValues
  });

  useEffect(() => {
    form.reset(
      selectedForecast
        ? {
            branchId: selectedForecast.branchId,
            productId: selectedForecast.productId,
            hour: selectedForecast.hour,
            forecastedSalesQty: selectedForecast.forecastedSalesQty
          }
        : defaultValues
    );
  }, [form, selectedForecast]);

  const saveMutation = useApiMutation({
    mutationFn: (values: ForecastFormValues) =>
      apiClient<ForecastDto>(selectedForecast ? `/api/forecasts/${selectedForecast.id}` : "/api/forecasts", {
        method: selectedForecast ? "PUT" : "POST",
        body: JSON.stringify(values)
      }),
    successMessage: selectedForecast ? "Прогноз оновлено" : "Прогноз створено",
    invalidateKeys: [["forecasts"], ["tasks"], ["dashboard"]],
    onSuccess: async () => {
      setSelectedForecast(null);
      form.reset(defaultValues);
    }
  });

  const deleteMutation = useApiMutation({
    mutationFn: (id: string) =>
      apiClient<void>(`/api/forecasts/${id}`, {
        method: "DELETE"
      }),
    successMessage: "Прогноз видалено",
    invalidateKeys: [["forecasts"], ["tasks"], ["dashboard"]],
    onSuccess: async () => {
      setSelectedForecast(null);
      form.reset(defaultValues);
    }
  });

  const columns: ColumnDef<ForecastDto>[] = [
    {
      accessorKey: "branch.name",
      header: "Філія",
      cell: ({ row }) => row.original.branch.name
    },
    {
      accessorKey: "product.name",
      header: "Товар",
      cell: ({ row }) => row.original.product.name
    },
    {
      accessorKey: "hour",
      header: "Година",
      cell: ({ row }) => formatDateTime(row.original.hour)
    },
    {
      accessorKey: "forecastedSalesQty",
      header: "К-сть"
    },
    {
      id: "actions",
      header: "Дії",
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-2" onClick={(event) => event.stopPropagation()}>
          <Button size="sm" variant="outline" onClick={() => setSelectedForecast(row.original)}>
            <Pencil className="mr-2 h-4 w-4" />
            Редагувати
          </Button>
          <ConfirmButton
            size="sm"
            variant="destructive"
            confirmText="Видалити прогноз?"
            onConfirm={() => deleteMutation.mutate(row.original.id)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Видалити
          </ConfirmButton>
        </div>
      )
    }
  ];

  if (forecasts.isLoading || branches.isLoading || products.isLoading) {
    return <LoadingState />;
  }

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Forecast CRUD"
        title="Прогнози"
        description="Погодинні прогнози продажів, які впливають на автоматичну генерацію задач."
      />

      <EntityPageShell
        tableTitle="Прогнози продажів"
        tableDescription="Кожен рядок відповідає прогнозу по товару у конкретній філії та годині."
        formTitle={selectedForecast ? "Редагування прогнозу" : "Створення прогнозу"}
        formDescription="Будь-яка зміна прогнозу одразу ініціює перерахунок production tasks."
        table={<DataTable columns={columns} data={forecasts.data ?? []} onRowClick={(row) => setSelectedForecast(row)} />}
        form={
          <form className="space-y-5" onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))}>
            <FormGrid>
              <div className="space-y-2">
                <Label htmlFor="forecast-branch">Філія</Label>
                <Select id="forecast-branch" {...form.register("branchId")}>
                  <option value="">Оберіть філію</option>
                  {(branches.data ?? []).map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </Select>
                <FormError message={form.formState.errors.branchId?.message} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="forecast-product">Товар</Label>
                <Select id="forecast-product" {...form.register("productId")}>
                  <option value="">Оберіть товар</option>
                  {(products.data ?? []).map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name}
                    </option>
                  ))}
                </Select>
                <FormError message={form.formState.errors.productId?.message} />
              </div>
            </FormGrid>

            <FormGrid className="md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="forecast-hour">Дата і година</Label>
                <Input
                  id="forecast-hour"
                  type="datetime-local"
                  value={toDateTimeLocalInputValue(form.watch("hour"))}
                  onChange={(event) =>
                    form.setValue("hour", new Date(event.target.value).toISOString(), {
                      shouldValidate: true
                    })
                  }
                />
                <FormError message={form.formState.errors.hour?.message} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="forecast-qty">Прогнозна кількість</Label>
                <Input id="forecast-qty" type="number" min={0} {...form.register("forecastedSalesQty")} />
                <FormError message={form.formState.errors.forecastedSalesQty?.message} />
              </div>
            </FormGrid>

            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={saveMutation.isPending}>
                {selectedForecast ? (
                  <>
                    <Pencil className="mr-2 h-4 w-4" />
                    Оновити прогноз
                  </>
                ) : (
                  <>
                    <Plus className="mr-2 h-4 w-4" />
                    Створити прогноз
                  </>
                )}
              </Button>
              {selectedForecast ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setSelectedForecast(null);
                    form.reset(defaultValues);
                  }}
                >
                  Скасувати
                </Button>
              ) : null}
            </div>
          </form>
        }
      />
    </section>
  );
}
