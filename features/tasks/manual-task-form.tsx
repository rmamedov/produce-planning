"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { manualTaskSchema } from "@/api/schemas";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FormError } from "@/components/ui/form-error";
import { FormGrid } from "@/components/ui/form-grid";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingState } from "@/components/ui/loading-state";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { apiClient, useApiMutation } from "@/hooks/use-api";
import { useReferenceData } from "@/hooks/use-reference-data";
import { toDateTimeLocalInputValue } from "@/lib/datetime";

type ManualTaskFormValues = z.infer<typeof manualTaskSchema>;

const defaultValues: ManualTaskFormValues = {
  branchId: "",
  productId: "",
  quantity: 1,
  priority: "HIGH",
  expectedReadyAt: new Date().toISOString(),
  comment: ""
};

export function ManualTaskForm() {
  const { branches, products } = useReferenceData();
  const form = useForm<ManualTaskFormValues>({
    resolver: zodResolver(manualTaskSchema),
    defaultValues
  });

  const mutation = useApiMutation({
    mutationFn: (values: ManualTaskFormValues) =>
      apiClient("/api/tasks", {
        method: "POST",
        body: JSON.stringify(values)
      }),
    successMessage: "Ручне завдання збережено",
    invalidateKeys: [["tasks"], ["dashboard"]],
    onSuccess: async () => {
      form.reset(defaultValues);
    }
  });

  if (branches.isLoading || products.isLoading) {
    return <LoadingState />;
  }

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Manual task creation"
        title="Ручне створення завдання"
        description="Використовуйте для виняткових ситуацій. Якщо активне завдання вже існує, система оновить його."
      />

      <Card>
        <CardContent className="pt-6">
          <form className="space-y-5" onSubmit={form.handleSubmit((values) => mutation.mutate(values))}>
            <FormGrid className="md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="manual-branch">Філія</Label>
                <Select id="manual-branch" {...form.register("branchId")}>
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
                <Label htmlFor="manual-product">Товар</Label>
                <Select id="manual-product" {...form.register("productId")}>
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

            <FormGrid className="md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="manual-quantity">Кількість</Label>
                <Input id="manual-quantity" type="number" min={1} {...form.register("quantity")} />
                <FormError message={form.formState.errors.quantity?.message} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="manual-priority">Пріоритет</Label>
                <Select id="manual-priority" {...form.register("priority")}>
                  <option value="CRITICAL">Critical</option>
                  <option value="HIGH">High</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="LOW">Low</option>
                </Select>
                <FormError message={form.formState.errors.priority?.message} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="manual-ready-at">Очікувана готовність</Label>
                <Input
                  id="manual-ready-at"
                  type="datetime-local"
                  value={toDateTimeLocalInputValue(form.watch("expectedReadyAt"))}
                  onChange={(event) =>
                    form.setValue("expectedReadyAt", new Date(event.target.value).toISOString(), {
                      shouldValidate: true
                    })
                  }
                />
                <FormError message={form.formState.errors.expectedReadyAt?.message} />
              </div>
            </FormGrid>

            <div className="space-y-2">
              <Label htmlFor="manual-comment">Коментар</Label>
              <Textarea
                id="manual-comment"
                placeholder="Наприклад, акційний день або коригування через нестачу сировини"
                {...form.register("comment")}
              />
              <FormError message={form.formState.errors.comment?.message} />
            </div>

            <Button type="submit" disabled={mutation.isPending}>
              Створити або оновити завдання
            </Button>
          </form>
        </CardContent>
      </Card>
    </section>
  );
}
