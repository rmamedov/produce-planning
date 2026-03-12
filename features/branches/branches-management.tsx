"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ColumnDef } from "@tanstack/react-table";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { branchSchema } from "@/api/schemas";
import { DataTable } from "@/components/admin/data-table";
import { EntityPageShell } from "@/components/admin/entity-page-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { FormError } from "@/components/ui/form-error";
import { FormGrid } from "@/components/ui/form-grid";
import { LoadingState } from "@/components/ui/loading-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiClient, useApiMutation, useApiQuery } from "@/hooks/use-api";
import type { BranchDto } from "@/types";

type BranchFormValues = z.infer<typeof branchSchema>;

export function BranchesManagement() {
  const [selectedBranch, setSelectedBranch] = useState<BranchDto | null>(null);
  const branches = useApiQuery<BranchDto[]>(["branches"], "/api/branches");

  const form = useForm<BranchFormValues>({
    resolver: zodResolver(branchSchema),
    defaultValues: {
      name: "",
      address: ""
    }
  });

  useEffect(() => {
    form.reset(
      selectedBranch
        ? {
            name: selectedBranch.name,
            address: selectedBranch.address
          }
        : {
            name: "",
            address: ""
          }
    );
  }, [form, selectedBranch]);

  const saveMutation = useApiMutation({
    mutationFn: (values: BranchFormValues) =>
      apiClient<BranchDto>(selectedBranch ? `/api/branches/${selectedBranch.id}` : "/api/branches", {
        method: selectedBranch ? "PUT" : "POST",
        body: JSON.stringify(values)
      }),
    successMessage: selectedBranch ? "Філію оновлено" : "Філію створено",
    invalidateKeys: [["branches"], ["dashboard"]],
    onSuccess: async () => {
      setSelectedBranch(null);
      form.reset();
    }
  });

  const deleteMutation = useApiMutation({
    mutationFn: (id: string) =>
      apiClient<void>(`/api/branches/${id}`, {
        method: "DELETE"
      }),
    successMessage: "Філію видалено",
    invalidateKeys: [["branches"], ["dashboard"]],
    onSuccess: async () => {
      setSelectedBranch(null);
      form.reset();
    }
  });

  const columns: ColumnDef<BranchDto>[] = [
    {
      accessorKey: "name",
      header: "Назва"
    },
    {
      accessorKey: "address",
      header: "Адреса"
    },
    {
      id: "actions",
      header: "Дії",
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-2" onClick={(event) => event.stopPropagation()}>
          <Button size="sm" variant="outline" onClick={() => setSelectedBranch(row.original)}>
            <Pencil className="mr-2 h-4 w-4" />
            Редагувати
          </Button>
          <ConfirmButton
            size="sm"
            variant="destructive"
            confirmText={`Видалити філію "${row.original.name}"?`}
            onConfirm={() => deleteMutation.mutate(row.original.id)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Видалити
          </ConfirmButton>
        </div>
      )
    }
  ];

  if (branches.isLoading) {
    return <LoadingState />;
  }

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Branch CRUD"
        title="Філії"
        description="Керуйте магазинами мережі, для яких система планує виробництво."
      />

      <EntityPageShell
        tableTitle="Список філій"
        tableDescription="Всі магазини, підключені до системи."
        formTitle={selectedBranch ? "Редагування філії" : "Створення філії"}
        formDescription="Назва та адреса використовуються в задачах, dashboard і прогнозах."
        table={
          <DataTable
            columns={columns}
            data={branches.data ?? []}
            onRowClick={(row) => setSelectedBranch(row)}
            emptyTitle="Філії ще не створено"
            emptyDescription="Почніть з додавання першого магазину."
          />
        }
        form={
          <form className="space-y-5" onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))}>
            <FormGrid>
              <div className="space-y-2">
                <Label htmlFor="branch-name">Назва</Label>
                <Input id="branch-name" placeholder="Магазин на Подолі" {...form.register("name")} />
                <FormError message={form.formState.errors.name?.message} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="branch-address">Адреса</Label>
                <Input id="branch-address" placeholder="вул. Сагайдачного, 13" {...form.register("address")} />
                <FormError message={form.formState.errors.address?.message} />
              </div>
            </FormGrid>

            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={saveMutation.isPending}>
                {selectedBranch ? (
                  <>
                    <Pencil className="mr-2 h-4 w-4" />
                    Оновити
                  </>
                ) : (
                  <>
                    <Plus className="mr-2 h-4 w-4" />
                    Створити
                  </>
                )}
              </Button>
              {selectedBranch ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setSelectedBranch(null);
                    form.reset();
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
