"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ColumnDef } from "@tanstack/react-table";
import { Minus, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { z } from "zod";

import { techCardSchema } from "@/api/schemas";
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
import { apiClient, useApiMutation, useApiQuery } from "@/hooks/use-api";
import type { TechCardDto } from "@/types";

type TechCardFormValues = z.infer<typeof techCardSchema>;

const createDefaultValues = (): TechCardFormValues => ({
  name: "",
  typicalCookingTimeMinutes: 30,
  ingredients: [{ ingredientName: "", quantity: 1, unit: "г" }],
  steps: [{ stepNumber: 1, description: "" }],
  requiredEquipment: ["Ніж"]
});

export function TechCardsManagement() {
  const [selectedCard, setSelectedCard] = useState<TechCardDto | null>(null);
  const techCards = useApiQuery<TechCardDto[]>(["tech-cards"], "/api/tech-cards");

  const form = useForm<TechCardFormValues>({
    resolver: zodResolver(techCardSchema),
    defaultValues: createDefaultValues()
  });

  const ingredients = useFieldArray({
    control: form.control,
    name: "ingredients"
  });

  const steps = useFieldArray({
    control: form.control,
    name: "steps"
  });

  useEffect(() => {
    form.reset(
      selectedCard
        ? {
            name: selectedCard.name,
            typicalCookingTimeMinutes: selectedCard.typicalCookingTimeMinutes,
            ingredients: selectedCard.ingredients.map((ingredient) => ({
              ingredientName: ingredient.ingredientName,
              quantity: ingredient.quantity,
              unit: ingredient.unit
            })),
            steps: selectedCard.steps.map((step) => ({
              stepNumber: step.stepNumber,
              description: step.description
            })),
            requiredEquipment: selectedCard.requiredEquipment.map((item) => item.label)
          }
        : createDefaultValues()
    );
  }, [form, selectedCard]);

  const saveMutation = useApiMutation({
    mutationFn: (values: TechCardFormValues) =>
      apiClient<TechCardDto>(selectedCard ? `/api/tech-cards/${selectedCard.id}` : "/api/tech-cards", {
        method: selectedCard ? "PUT" : "POST",
        body: JSON.stringify(values)
      }),
    successMessage: selectedCard ? "Техкарту оновлено" : "Техкарту створено",
    invalidateKeys: [["tech-cards"], ["products"]],
    onSuccess: async () => {
      setSelectedCard(null);
      form.reset(createDefaultValues());
    }
  });

  const deleteMutation = useApiMutation({
    mutationFn: (id: string) =>
      apiClient<void>(`/api/tech-cards/${id}`, {
        method: "DELETE"
      }),
    successMessage: "Техкарту видалено",
    invalidateKeys: [["tech-cards"], ["products"]],
    onSuccess: async () => {
      setSelectedCard(null);
      form.reset(createDefaultValues());
    }
  });

  const columns: ColumnDef<TechCardDto>[] = [
    {
      accessorKey: "name",
      header: "Назва"
    },
    {
      accessorKey: "typicalCookingTimeMinutes",
      header: "Час",
      cell: ({ row }) => `${row.original.typicalCookingTimeMinutes} хв`
    },
    {
      id: "ingredients",
      header: "Інгредієнти",
      cell: ({ row }) => row.original.ingredients.length
    },
    {
      id: "actions",
      header: "Дії",
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-2" onClick={(event) => event.stopPropagation()}>
          <Button size="sm" variant="outline" onClick={() => setSelectedCard(row.original)}>
            <Pencil className="mr-2 h-4 w-4" />
            Редагувати
          </Button>
          <ConfirmButton
            size="sm"
            variant="destructive"
            confirmText={`Видалити техкарту "${row.original.name}"?`}
            onConfirm={() => deleteMutation.mutate(row.original.id)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Видалити
          </ConfirmButton>
        </div>
      )
    }
  ];

  if (techCards.isLoading) {
    return <LoadingState />;
  }

  const equipmentValues = form.watch("requiredEquipment");

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Technological card CRUD"
        title="Технологічні карти"
        description="Опис рецептури, кроків та обладнання для автоматичного розрахунку часу виробництва."
      />

      <EntityPageShell
        tableTitle="Технологічні карти"
        tableDescription="Кожна техкарта містить динамічні інгредієнти, кроки та обладнання."
        formTitle={selectedCard ? "Редагування техкарти" : "Створення техкарти"}
        formDescription="Поля заповнюються динамічно, усі зміни одразу використовуються алгоритмом задач."
        table={<DataTable columns={columns} data={techCards.data ?? []} onRowClick={(row) => setSelectedCard(row)} />}
        form={
          <form className="space-y-6" onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))}>
            <FormGrid>
              <div className="space-y-2">
                <Label htmlFor="tech-card-name">Назва</Label>
                <Input id="tech-card-name" placeholder="Салат Олів'є" {...form.register("name")} />
                <FormError message={form.formState.errors.name?.message} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tech-card-time">Час приготування, хв</Label>
                <Input id="tech-card-time" type="number" min={1} {...form.register("typicalCookingTimeMinutes")} />
                <FormError message={form.formState.errors.typicalCookingTimeMinutes?.message} />
              </div>
            </FormGrid>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Інгредієнти</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => ingredients.append({ ingredientName: "", quantity: 1, unit: "г" })}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Додати
                </Button>
              </div>
              <div className="space-y-3">
                {ingredients.fields.map((field, index) => (
                  <div key={field.id} className="grid gap-3 rounded-2xl border border-border/70 p-4 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label>Інгредієнт</Label>
                      <Input {...form.register(`ingredients.${index}.ingredientName`)} />
                      <FormError message={form.formState.errors.ingredients?.[index]?.ingredientName?.message} />
                    </div>
                    <div className="space-y-2">
                      <Label>Кількість</Label>
                      <Input type="number" step="0.01" {...form.register(`ingredients.${index}.quantity`)} />
                      <FormError message={form.formState.errors.ingredients?.[index]?.quantity?.message} />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>Одиниця</Label>
                        {ingredients.fields.length > 1 ? (
                          <Button type="button" size="icon" variant="ghost" onClick={() => ingredients.remove(index)}>
                            <Minus className="h-4 w-4" />
                          </Button>
                        ) : null}
                      </div>
                      <Input {...form.register(`ingredients.${index}.unit`)} />
                      <FormError message={form.formState.errors.ingredients?.[index]?.unit?.message} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Кроки</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    steps.append({
                      stepNumber: steps.fields.length + 1,
                      description: ""
                    })
                  }
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Додати
                </Button>
              </div>
              <div className="space-y-3">
                {steps.fields.map((field, index) => (
                  <div key={field.id} className="grid gap-3 rounded-2xl border border-border/70 p-4 md:grid-cols-[120px_1fr]">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>Крок</Label>
                        {steps.fields.length > 1 ? (
                          <Button type="button" size="icon" variant="ghost" onClick={() => steps.remove(index)}>
                            <Minus className="h-4 w-4" />
                          </Button>
                        ) : null}
                      </div>
                      <Input type="number" min={1} {...form.register(`steps.${index}.stepNumber`)} />
                      <FormError message={form.formState.errors.steps?.[index]?.stepNumber?.message} />
                    </div>
                    <div className="space-y-2">
                      <Label>Опис</Label>
                      <Input {...form.register(`steps.${index}.description`)} />
                      <FormError message={form.formState.errors.steps?.[index]?.description?.message} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Обладнання</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    form.setValue("requiredEquipment", [...equipmentValues, ""], {
                      shouldValidate: true
                    })
                  }
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Додати
                </Button>
              </div>
              <div className="space-y-3">
                {equipmentValues.map((_, index) => (
                  <div key={`${index}-${equipmentValues[index]}`} className="flex gap-3">
                    <Input {...form.register(`requiredEquipment.${index}`)} />
                    {equipmentValues.length > 1 ? (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() =>
                          form.setValue(
                            "requiredEquipment",
                            equipmentValues.filter((__, equipmentIndex) => equipmentIndex !== index),
                            {
                              shouldValidate: true
                            }
                          )
                        }
                      >
                        <Minus className="h-4 w-4" />
                      </Button>
                    ) : null}
                  </div>
                ))}
                <FormError message={form.formState.errors.requiredEquipment?.message as string | undefined} />
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={saveMutation.isPending}>
                {selectedCard ? "Оновити техкарту" : "Створити техкарту"}
              </Button>
              {selectedCard ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setSelectedCard(null);
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
