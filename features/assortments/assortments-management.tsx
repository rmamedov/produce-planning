"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ColumnDef } from "@tanstack/react-table";
import { Minus, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { z } from "zod";

import { assortmentSchema } from "@/api/schemas";
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
import type { AssortmentDto } from "@/types";

type AssortmentFormValues = z.infer<typeof assortmentSchema>;

const createDefaultValues = (): AssortmentFormValues => ({
  branchId: "",
  items: [{ productId: "", currentStock: 0, hourlyTargetStock: 2 }]
});

export function AssortmentsManagement() {
  const [selectedAssortment, setSelectedAssortment] = useState<AssortmentDto | null>(null);
  const assortments = useApiQuery<AssortmentDto[]>(["assortments"], "/api/assortments");
  const { branches, products } = useReferenceData();

  const form = useForm<AssortmentFormValues>({
    resolver: zodResolver(assortmentSchema),
    defaultValues: createDefaultValues()
  });

  const items = useFieldArray({
    control: form.control,
    name: "items"
  });

  useEffect(() => {
    form.reset(
      selectedAssortment
        ? {
            branchId: selectedAssortment.branchId,
            items: selectedAssortment.items.map((item) => ({
              productId: item.productId,
              currentStock: item.currentStock,
              hourlyTargetStock: item.hourlyTargetStock
            }))
          }
        : createDefaultValues()
    );
  }, [form, selectedAssortment]);

  const saveMutation = useApiMutation({
    mutationFn: (values: AssortmentFormValues) =>
      apiClient<AssortmentDto>("/api/assortments", {
        method: "POST",
        body: JSON.stringify(values)
      }),
    successMessage: selectedAssortment ? "Асортимент оновлено" : "Асортимент створено",
    invalidateKeys: [["assortments"], ["tasks"], ["dashboard"]],
    onSuccess: async () => {
      setSelectedAssortment(null);
      form.reset(createDefaultValues());
    }
  });

  const deleteMutation = useApiMutation({
    mutationFn: (id: string) =>
      apiClient<void>(`/api/assortments/${id}`, {
        method: "DELETE"
      }),
    successMessage: "Асортимент видалено",
    invalidateKeys: [["assortments"], ["tasks"], ["dashboard"]],
    onSuccess: async () => {
      setSelectedAssortment(null);
      form.reset(createDefaultValues());
    }
  });

  const columns: ColumnDef<AssortmentDto>[] = [
    {
      accessorKey: "branch.name",
      header: "Філія",
      cell: ({ row }) => row.original.branch.name
    },
    {
      id: "items",
      header: "Товари",
      cell: ({ row }) => row.original.items.map((item) => item.product.name).join(", ")
    },
    {
      id: "actions",
      header: "Дії",
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-2" onClick={(event) => event.stopPropagation()}>
          <Button size="sm" variant="outline" onClick={() => setSelectedAssortment(row.original)}>
            <Pencil className="mr-2 h-4 w-4" />
            Редагувати
          </Button>
          <ConfirmButton
            size="sm"
            variant="destructive"
            confirmText={`Видалити асортимент філії "${row.original.branch.name}"?`}
            onConfirm={() => deleteMutation.mutate(row.original.id)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Видалити
          </ConfirmButton>
        </div>
      )
    }
  ];

  if (assortments.isLoading || branches.isLoading || products.isLoading) {
    return <LoadingState />;
  }

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Assortment"
        title="Асортимент"
        description="Прив'язка товарів до конкретних філій з branch-specific залишками та цільовим запасом."
      />

      <EntityPageShell
        tableTitle="Асортименти філій"
        tableDescription="Один асортимент на філію, всередині якого зберігаються залишки та цільові запаси."
        formTitle={selectedAssortment ? "Редагування асортименту" : "Створення асортименту"}
        formDescription="Після оновлення система одразу перераховує автоматичні задачі для кожного товару."
        table={<DataTable columns={columns} data={assortments.data ?? []} onRowClick={(row) => setSelectedAssortment(row)} />}
        form={
          <form className="space-y-5" onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))}>
            <div className="space-y-2">
              <Label htmlFor="assortment-branch">Філія</Label>
              <Select id="assortment-branch" {...form.register("branchId")}>
                <option value="">Оберіть філію</option>
                {(branches.data ?? []).map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </Select>
              <FormError message={form.formState.errors.branchId?.message} />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Товари у філії</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => items.append({ productId: "", currentStock: 0, hourlyTargetStock: 2 })}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Додати товар
                </Button>
              </div>

              <div className="space-y-3">
                {items.fields.map((field, index) => (
                  <div key={field.id} className="grid gap-3 rounded-2xl border border-border/70 p-4 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label>Товар</Label>
                      <Select {...form.register(`items.${index}.productId`)}>
                        <option value="">Оберіть товар</option>
                        {(products.data ?? []).map((product) => (
                          <option key={product.id} value={product.id}>
                            {product.name}
                          </option>
                        ))}
                      </Select>
                      <FormError message={form.formState.errors.items?.[index]?.productId?.message} />
                    </div>
                    <div className="space-y-2">
                      <Label>Поточний залишок</Label>
                      <Input type="number" min={0} {...form.register(`items.${index}.currentStock`)} />
                      <FormError message={form.formState.errors.items?.[index]?.currentStock?.message} />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>Цільовий запас / год</Label>
                        {items.fields.length > 1 ? (
                          <Button type="button" size="icon" variant="ghost" onClick={() => items.remove(index)}>
                            <Minus className="h-4 w-4" />
                          </Button>
                        ) : null}
                      </div>
                      <Input type="number" min={0} {...form.register(`items.${index}.hourlyTargetStock`)} />
                      <FormError message={form.formState.errors.items?.[index]?.hourlyTargetStock?.message} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={saveMutation.isPending}>
                {selectedAssortment ? "Оновити асортимент" : "Зберегти асортимент"}
              </Button>
              {selectedAssortment ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setSelectedAssortment(null);
                    form.reset(createDefaultValues());
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
