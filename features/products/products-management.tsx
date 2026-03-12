"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ColumnDef } from "@tanstack/react-table";
import Image from "next/image";
import { Pencil, Plus, Trash2, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { productSchema } from "@/api/schemas";
import { DataTable } from "@/components/admin/data-table";
import { EntityPageShell } from "@/components/admin/entity-page-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { FormError } from "@/components/ui/form-error";
import { FormGrid } from "@/components/ui/form-grid";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingState } from "@/components/ui/loading-state";
import { Select } from "@/components/ui/select";
import { apiClient, useApiMutation, useApiQuery } from "@/hooks/use-api";
import type { ProductDto, TechCardDto } from "@/types";

type ProductFormValues = z.infer<typeof productSchema>;

const defaultValues: ProductFormValues = {
  name: "",
  photoUrl: "",
  unitWeight: 100,
  technologicalCardId: null
};

export function ProductsManagement() {
  const [selectedProduct, setSelectedProduct] = useState<ProductDto | null>(null);
  const products = useApiQuery<ProductDto[]>(["products"], "/api/products");
  const techCards = useApiQuery<TechCardDto[]>(["tech-cards"], "/api/tech-cards");

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues
  });

  useEffect(() => {
    form.reset(
      selectedProduct
        ? {
            name: selectedProduct.name,
            photoUrl: selectedProduct.photoUrl ?? "",
            unitWeight: selectedProduct.unitWeight,
            technologicalCardId: selectedProduct.technologicalCardId ?? null
          }
        : defaultValues
    );
  }, [form, selectedProduct]);

  const saveMutation = useApiMutation({
    mutationFn: (values: ProductFormValues) =>
      apiClient<ProductDto>(selectedProduct ? `/api/products/${selectedProduct.id}` : "/api/products", {
        method: selectedProduct ? "PUT" : "POST",
        body: JSON.stringify(values)
      }),
    successMessage: selectedProduct ? "Товар оновлено" : "Товар створено",
    invalidateKeys: [["products"], ["assortments"], ["tasks"], ["dashboard"]],
    onSuccess: async () => {
      setSelectedProduct(null);
      form.reset(defaultValues);
    }
  });

  const deleteMutation = useApiMutation({
    mutationFn: (id: string) =>
      apiClient<void>(`/api/products/${id}`, {
        method: "DELETE"
      }),
    successMessage: "Товар видалено",
    invalidateKeys: [["products"], ["assortments"], ["tasks"], ["dashboard"]],
    onSuccess: async () => {
      setSelectedProduct(null);
      form.reset(defaultValues);
    }
  });

  const uploadMutation = useApiMutation({
    mutationFn: async (file: File) => {
      const body = new FormData();
      body.append("file", file);

      return apiClient<{ photoUrl: string }>("/api/products/upload", {
        method: "POST",
        body
      });
    },
    successMessage: "Фото завантажено",
    onSuccess: async (result) => {
      form.setValue("photoUrl", result.photoUrl, {
        shouldValidate: true
      });
    }
  });

  const columns: ColumnDef<ProductDto>[] = [
    {
      accessorKey: "name",
      header: "Товар"
    },
    {
      accessorKey: "unitWeight",
      header: "Вага",
      cell: ({ row }) => `${row.original.unitWeight} г`
    },
    {
      id: "techCard",
      header: "Техкарта",
      cell: ({ row }) => row.original.technologicalCard?.name || "—"
    },
    {
      id: "photo",
      header: "Фото",
      cell: ({ row }) =>
        row.original.photoUrl ? <Badge variant="secondary">Є фото</Badge> : <Badge variant="outline">Немає</Badge>
    },
    {
      id: "actions",
      header: "Дії",
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-2" onClick={(event) => event.stopPropagation()}>
          <Button size="sm" variant="outline" onClick={() => setSelectedProduct(row.original)}>
            <Pencil className="mr-2 h-4 w-4" />
            Редагувати
          </Button>
          <ConfirmButton
            size="sm"
            variant="destructive"
            confirmText={`Видалити товар "${row.original.name}"?`}
            onConfirm={() => deleteMutation.mutate(row.original.id)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Видалити
          </ConfirmButton>
        </div>
      )
    }
  ];

  if (products.isLoading || techCards.isLoading) {
    return <LoadingState />;
  }

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Product CRUD"
        title="Товари"
        description="Каталог кулінарних товарів з фото, вагою та прив'язкою до технологічних карт."
      />

      <EntityPageShell
        tableTitle="Товари"
        tableDescription="Каталог товарів, які можуть бути включені в асортимент філій."
        formTitle={selectedProduct ? "Редагування товару" : "Створення товару"}
        formDescription="Окремі залишки та цільові запаси налаштовуються на сторінці асортименту."
        table={<DataTable columns={columns} data={products.data ?? []} onRowClick={(row) => setSelectedProduct(row)} />}
        form={
          <form className="space-y-5" onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))}>
            <FormGrid>
              <div className="space-y-2">
                <Label htmlFor="product-name">Назва</Label>
                <Input id="product-name" placeholder="Салат Олів'є" {...form.register("name")} />
                <FormError message={form.formState.errors.name?.message} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="product-weight">Вага, г</Label>
                <Input id="product-weight" type="number" min={1} {...form.register("unitWeight")} />
                <FormError message={form.formState.errors.unitWeight?.message} />
              </div>
            </FormGrid>

            <div className="space-y-2">
              <Label htmlFor="tech-card-select">Технологічна карта</Label>
              <Select
                id="tech-card-select"
                value={form.watch("technologicalCardId") ?? ""}
                onChange={(event) =>
                  form.setValue("technologicalCardId", event.target.value || null, {
                    shouldValidate: true
                  })
                }
              >
                <option value="">Без техкарти</option>
                {(techCards.data ?? []).map((card) => (
                  <option key={card.id} value={card.id}>
                    {card.name}
                  </option>
                ))}
              </Select>
              <FormError message={form.formState.errors.technologicalCardId?.message as string | undefined} />
            </div>

            <div className="space-y-3 rounded-2xl border border-border/70 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <Label htmlFor="product-photo">Фото товару</Label>
                  <p className="text-sm text-muted-foreground">Завантаження в локальне сховище `public/uploads`.</p>
                </div>
                <label className="inline-flex cursor-pointer items-center">
                  <input
                    id="product-photo"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) {
                        uploadMutation.mutate(file);
                      }
                    }}
                  />
                  <span className="inline-flex items-center rounded-2xl border border-border bg-white px-4 py-2 text-sm font-semibold">
                    <Upload className="mr-2 h-4 w-4" />
                    Завантажити фото
                  </span>
                </label>
              </div>

              {form.watch("photoUrl") ? (
                <div className="overflow-hidden rounded-2xl border border-border/70">
                  <Image
                    src={form.watch("photoUrl") || ""}
                    alt={form.watch("name") || "Product photo"}
                    width={720}
                    height={320}
                    className="h-48 w-full object-cover"
                  />
                </div>
              ) : null}

              <div className="space-y-2">
                <Label htmlFor="photo-url">Photo URL</Label>
                <Input id="photo-url" placeholder="/uploads/photo.jpg" {...form.register("photoUrl")} />
                <FormError message={form.formState.errors.photoUrl?.message} />
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={saveMutation.isPending}>
                {selectedProduct ? (
                  <>
                    <Pencil className="mr-2 h-4 w-4" />
                    Оновити товар
                  </>
                ) : (
                  <>
                    <Plus className="mr-2 h-4 w-4" />
                    Створити товар
                  </>
                )}
              </Button>
              {selectedProduct ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setSelectedProduct(null);
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
