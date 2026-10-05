"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ColumnDef } from "@tanstack/react-table";
import { Minus, Pencil, Plus, Trash2 } from "lucide-react";
import { Fragment, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { presentationSchema } from "@/api/schemas";
import { DataTable } from "@/components/admin/data-table";
import { EntityPageShell } from "@/components/admin/entity-page-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { FormError } from "@/components/ui/form-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingState } from "@/components/ui/loading-state";
import { Select } from "@/components/ui/select";
import { getFilialName, getFilialShortName } from "@/domain/filials";
import {
  DEFAULT_WINDOW_HOURS,
  DUPLICATE_NAME_MESSAGE,
  WINDOW_PRESETS,
  activeTasksLabel,
  batchCountLabel,
  buildGroupingExample,
  filialCountWarning,
  findOverlaps,
  formatFilialsLine,
  formatHours,
  formatMinuteOfDay,
  formatProducerLine,
  isDuplicateName,
  isValidWindowHours,
  parseHoursInput,
  stepHours
} from "@/features/presentations/presentation-form";
import type { FilialSummary, Presentation, PresentationsResponse } from "@/features/production-tasks/types";
import { apiClient, useApiMutation, useApiQuery } from "@/hooks/use-api";
import { cn } from "@/lib/utils";

type PresentationPayload = z.infer<typeof presentationSchema>;

interface PresentationFormValues {
  name: string;
  filial_ids: number[];
  window_hours: string;
  /** "" — every filial produces for itself. */
  production_filial_id: string;
}

const toPayload = (values: PresentationFormValues): PresentationPayload => ({
  name: values.name.trim(),
  filial_ids: [...values.filial_ids].sort((a, b) => a - b),
  // Unparseable input becomes 0 so the schema reports its range message rather than a type error.
  window_hours: parseHoursInput(values.window_hours) ?? 0,
  production_filial_id: values.production_filial_id ? Number(values.production_filial_id) : null
});

const presentationFormSchema = z.preprocess(
  (values) => toPayload(values as PresentationFormValues),
  presentationSchema
);

const createDefaultValues = (): PresentationFormValues => ({
  name: "",
  filial_ids: [],
  window_hours: formatHours(DEFAULT_WINDOW_HOURS),
  production_filial_id: ""
});

const EXAMPLE_COLORS = ["#1C7356", "#F06124", "#2358D1", "#9333EA", "#CA8A04", "#0E7490", "#DB2777", "#4B5563"];

const AXIS_FROM = 6 * 60;
const AXIS_TO = 24 * 60;
const AXIS_TICKS = [6, 9, 12, 15, 18, 21, 24].map((hour) => hour * 60);

const axisX = (minute: number) =>
  ((Math.min(Math.max(minute, AXIS_FROM), AXIS_TO) - AXIS_FROM) / (AXIS_TO - AXIS_FROM)) * 100;

export function PresentationsManagement() {
  const [selectedPresentation, setSelectedPresentation] = useState<Presentation | null>(null);
  const presentations = useApiQuery<PresentationsResponse>(["presentations"], "/api/presentations");
  const filials = useApiQuery<FilialSummary[]>(["production-filials"], "/api/production-tasks/filials");

  const form = useForm<PresentationFormValues>({
    resolver: zodResolver(presentationFormSchema, undefined, { raw: true }),
    defaultValues: createDefaultValues()
  });

  useEffect(() => {
    form.reset(
      selectedPresentation
        ? {
            name: selectedPresentation.name,
            filial_ids: selectedPresentation.filial_ids,
            window_hours: formatHours(selectedPresentation.window_hours),
            production_filial_id:
              selectedPresentation.production_filial_id === null ? "" : String(selectedPresentation.production_filial_id)
          }
        : createDefaultValues()
    );
  }, [form, selectedPresentation]);

  const saveMutation = useApiMutation({
    mutationFn: (values: PresentationPayload) =>
      apiClient<Presentation>(
        selectedPresentation ? `/api/presentations/${selectedPresentation.id}` : "/api/presentations",
        {
          method: selectedPresentation ? "PUT" : "POST",
          body: JSON.stringify(values)
        }
      ),
    successMessage: selectedPresentation ? "Представлення оновлено" : "Представлення створено",
    invalidateKeys: [["presentations"]],
    onSuccess: async () => {
      setSelectedPresentation(null);
      form.reset();
    }
  });

  const deleteMutation = useApiMutation({
    mutationFn: (id: string) =>
      apiClient<void>(`/api/presentations/${id}`, {
        method: "DELETE"
      }),
    successMessage: "Представлення видалено",
    invalidateKeys: [["presentations"]],
    onSuccess: async () => {
      setSelectedPresentation(null);
      form.reset();
    }
  });

  const presentationList = useMemo(() => presentations.data?.presentations ?? [], [presentations.data]);
  const filialById = useMemo(
    () => new Map((filials.data ?? []).map((filial) => [filial.filial_id, filial])),
    [filials.data]
  );
  const shortName = useCallback(
    (filialId: number) => filialById.get(filialId)?.short_name ?? getFilialShortName(filialId),
    [filialById]
  );

  const selectedIds = form.watch("filial_ids");
  const windowRaw = form.watch("window_hours");
  const productionFilialRaw = form.watch("production_filial_id");
  const windowHours = parseHoursInput(windowRaw);
  const editingId = selectedPresentation?.id ?? null;
  const isSubmitted = form.formState.isSubmitted;

  // Filials of the edited presentation stay listed even if the API no longer reports them, so they can be unticked.
  const tileFilials = useMemo(() => {
    const tiles = new Map(filialById);
    for (const id of [...selectedIds, ...(selectedPresentation?.filial_ids ?? [])]) {
      if (!tiles.has(id)) {
        tiles.set(id, { filial_id: id, name: getFilialName(id), short_name: getFilialShortName(id), active_tasks: 0 });
      }
    }
    return [...tiles.values()].sort((a, b) => a.filial_id - b.filial_id);
  }, [filialById, selectedIds, selectedPresentation]);

  const overlaps = findOverlaps(selectedIds, presentationList, editingId);
  const warning = filialCountWarning(selectedIds.length);

  const setWindow = (value: string) =>
    form.setValue("window_hours", value, { shouldDirty: true, shouldValidate: isSubmitted });

  const setProductionFilial = (value: string) =>
    form.setValue("production_filial_id", value, { shouldDirty: true, shouldValidate: isSubmitted });

  const toggleFilial = (filialId: number) => {
    const removing = selectedIds.includes(filialId);
    form.setValue(
      "filial_ids",
      removing ? selectedIds.filter((id) => id !== filialId) : [...selectedIds, filialId],
      { shouldDirty: true, shouldValidate: isSubmitted }
    );
    if (removing && productionFilialRaw === String(filialId)) {
      setProductionFilial("");
    }
  };

  const cancelEdit = () => {
    setSelectedPresentation(null);
    form.reset();
  };

  const columns: ColumnDef<Presentation>[] = [
    {
      id: "name",
      header: "Назва і філії",
      cell: ({ row }) => {
        const producer = formatProducerLine(row.original.production_filial_id, shortName);

        return (
          <div className="space-y-1">
            <p className="font-medium">{row.original.name}</p>
            <p className="text-[13px] leading-5 text-muted-foreground">
              {formatFilialsLine(row.original.filial_ids, shortName)}
            </p>
            {producer ? <p className="text-[13px] leading-5 text-muted-foreground">{producer}</p> : null}
          </div>
        );
      }
    },
    {
      id: "window",
      header: "Групування",
      cell: ({ row }) => (
        <Badge variant="secondary" className="whitespace-nowrap">
          {formatHours(row.original.window_hours)} год
        </Badge>
      )
    },
    {
      id: "actions",
      header: "Дії",
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-2" onClick={(event) => event.stopPropagation()}>
          <Button size="sm" variant="outline" onClick={() => setSelectedPresentation(row.original)}>
            <Pencil className="mr-2 h-4 w-4" />
            Редагувати
          </Button>
          <ConfirmButton
            size="sm"
            variant="destructive"
            confirmText={`Видалити представлення «${row.original.name}»? Планшети, де воно обране, повернуться до вибору філії.`}
            onConfirm={() => deleteMutation.mutate(row.original.id)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Видалити
          </ConfirmButton>
        </div>
      )
    }
  ];

  if (presentations.isLoading) {
    return <LoadingState />;
  }

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Presentation CRUD"
        title="Представлення"
        description="Обʼєднайте кілька філій, щоб кухня бачила їхні замовлення поруч і виготовляла однакові позиції однією партією."
      />

      <EntityPageShell
        tableTitle="Список представлень"
        tableDescription="Зʼявляються в списку філій на кухонному планшеті."
        formTitle={selectedPresentation ? "Редагування представлення" : "Створення представлення"}
        formDescription="Назву побачать кухарі у списку філій."
        table={
          <DataTable
            columns={columns}
            data={presentationList}
            onRowClick={(row) => setSelectedPresentation(row)}
            emptyTitle="Представлення ще не створено"
            emptyDescription="Обʼєднайте 2+ філії, щоб кухня бачила їхні замовлення поруч"
          />
        }
        form={
          <form
            className="space-y-6"
            onSubmit={form.handleSubmit((values) => {
              if (isDuplicateName(values.name, presentationList, editingId)) {
                form.setError("name", { message: DUPLICATE_NAME_MESSAGE });
                return;
              }
              saveMutation.mutate(toPayload(values));
            })}
          >
            <div className="space-y-2">
              <Label htmlFor="presentation-name">Назва представлення</Label>
              <Input
                id="presentation-name"
                placeholder="Напр. Лівобережна кухня"
                maxLength={40}
                autoComplete="off"
                {...form.register("name")}
              />
              <FormError message={form.formState.errors.name?.message} />
            </div>

            <div className="space-y-3">
              <div
                id="presentation-filials-label"
                className="flex items-center justify-between gap-4 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground"
              >
                <span>Філії</span>
                <span>Вибрано {selectedIds.length}</span>
              </div>

              <div role="group" aria-labelledby="presentation-filials-label" className="grid grid-cols-1 gap-2">
                {tileFilials.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {filials.isLoading
                      ? "Завантаження філій…"
                      : filials.isError
                        ? "Не вдалося завантажити філії."
                        : "Немає філій із задачами або пріоритетами."}
                  </p>
                ) : (
                  tileFilials.map((filial) => {
                    const checked = selectedIds.includes(filial.filial_id);

                    return (
                      <label
                        key={filial.filial_id}
                        className={cn(
                          "flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition",
                          checked ? "border-primary bg-primary/5" : "border-border/70 bg-white hover:bg-muted/40"
                        )}
                      >
                        <input
                          type="checkbox"
                          className="h-[18px] w-[18px] shrink-0 accent-primary"
                          checked={checked}
                          onChange={() => toggleFilial(filial.filial_id)}
                        />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">{filial.short_name}</span>
                          <span className="block text-[13px] leading-5 text-muted-foreground">
                            {filial.filial_id} · {activeTasksLabel(filial.active_tasks)}
                          </span>
                        </span>
                      </label>
                    );
                  })
                )}
              </div>

              <FormError message={form.formState.errors.filial_ids?.message as string | undefined} />

              {overlaps.filialIds.length ? (
                <p className="rounded-2xl bg-primary/[0.07] px-4 py-3 text-[13px] leading-5 text-primary">
                  {overlaps.filialIds.map((id, index) => (
                    <Fragment key={id}>
                      {index ? ", " : null}
                      <b className="font-semibold">{shortName(id)}</b>
                    </Fragment>
                  ))}{" "}
                  {overlaps.filialIds.length === 1 ? "вже входить" : "вже входять"} у{" "}
                  {overlaps.presentationNames.map((name) => `«${name}»`).join(", ")}. Так можна: кожне представлення
                  групує за своїм часом, а партія, яку взяли в роботу, фіксується для всіх планшетів.
                </p>
              ) : null}

              {warning ? (
                <p className="rounded-2xl bg-warning/15 px-4 py-3 text-[13px] font-medium leading-5 text-amber-700">
                  {warning}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="presentation-production-filial">Філія-виробник (звідки трансфер)</Label>
              <Select
                id="presentation-production-filial"
                value={productionFilialRaw}
                onChange={(event) => setProductionFilial(event.target.value)}
              >
                <option value="">Кожна філія виробляє сама</option>
                {[...selectedIds]
                  .sort((a, b) => a - b)
                  .map((filialId) => (
                    <option key={filialId} value={String(filialId)}>
                      {shortName(filialId)} · {filialId}
                    </option>
                  ))}
              </Select>
              <FormError message={form.formState.errors.production_filial_id?.message} />
              <p className="text-[13px] leading-5 text-muted-foreground">
                «Оформити документ» на вкладці «Виконані» створить у Рубіконі трансфер із цієї філії до філії-замовника.
              </p>
            </div>

            <div className="space-y-3">
              <Label htmlFor="presentation-window">Час групування, год</Label>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-11 w-11 shrink-0"
                  aria-label="Менше"
                  disabled={stepHours(windowRaw, -1) === windowRaw}
                  onClick={() => setWindow(stepHours(windowRaw, -1))}
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <Input
                  id="presentation-window"
                  inputMode="decimal"
                  autoComplete="off"
                  className="max-w-[112px] text-center text-base font-semibold"
                  {...form.register("window_hours")}
                />
                <Button
                  variant="outline"
                  size="icon"
                  className="h-11 w-11 shrink-0"
                  aria-label="Більше"
                  disabled={stepHours(windowRaw, 1) === windowRaw}
                  onClick={() => setWindow(stepHours(windowRaw, 1))}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {WINDOW_PRESETS.map((hours) => {
                  const active = windowHours === hours;

                  return (
                    <button
                      key={hours}
                      type="button"
                      aria-pressed={active}
                      className={cn(
                        "h-8 rounded-full border px-3 text-[13px] font-semibold transition",
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-white hover:bg-muted"
                      )}
                      onClick={() => setWindow(formatHours(hours))}
                    >
                      {hours} год
                    </button>
                  );
                })}
              </div>
              <FormError message={form.formState.errors.window_hours?.message} />
              <p className="text-[13px] leading-5 text-muted-foreground">
                Від 0,5 до 24 год, крок 0,5. Замовлення одного артикула, чия готовність укладається в це вікно від
                найранішого, кухня бачить однією партією.
              </p>
            </div>

            <GroupingExamplePreview filialIds={selectedIds} windowHours={windowHours} shortName={shortName} />

            {selectedPresentation ? (
              <p className="rounded-2xl bg-primary/[0.07] px-4 py-3 text-[13px] leading-5 text-primary">
                Зміни застосуються до нових партій. Партії «В роботі» лишаються як є, доки їх не завершать.
              </p>
            ) : null}

            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={saveMutation.isPending}>
                {selectedPresentation ? (
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
              {selectedPresentation ? (
                <Button type="button" variant="outline" onClick={cancelEdit}>
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

function GroupingExamplePreview({
  filialIds,
  windowHours,
  shortName
}: {
  filialIds: number[];
  windowHours: number | null;
  shortName: (filialId: number) => string;
}) {
  const example = useMemo(() => buildGroupingExample(filialIds, windowHours), [filialIds, windowHours]);
  const colorOf = (filialId: number) => EXAMPLE_COLORS[Math.max(0, filialIds.indexOf(filialId)) % EXAMPLE_COLORS.length];

  let body: ReactNode;

  if (filialIds.length < 2) {
    body = (
      <p className="text-[13px] leading-5 text-muted-foreground">
        Оберіть щонайменше 2 філії — тут зʼявиться приклад, як їхні замовлення обʼєднаються в партії.
      </p>
    );
  } else if (!example || !isValidWindowHours(windowHours)) {
    body = (
      <p className="text-[13px] leading-5 text-muted-foreground">
        Вкажіть час групування від 0,5 до 24 год — тут зʼявиться приклад.
      </p>
    );
  } else {
    const compactLabels = example.batches.some(
      (batch, index) => index > 0 && axisX(batch.start) - axisX(example.batches[index - 1].start) < 28
    );
    const legendIds = [...new Set(example.orders.map((order) => order.filialId))];

    body = (
      <>
        <p className="text-[13px] leading-5 text-muted-foreground">
          Замовлення одного артикула:{" "}
          {example.orders.map((order) => `${shortName(order.filialId)} ${formatMinuteOfDay(order.minute)}`).join(", ")}.
          При групуванні <b className="font-semibold text-foreground">{formatHours(windowHours)} год</b> кухня
          побачить <b className="font-semibold text-foreground">{batchCountLabel(example.batches.length)}</b>:{" "}
          {example.batches
            .map(
              (batch) =>
                `${formatMinuteOfDay(batch.start)}–${formatMinuteOfDay(batch.end)} (${batch.filialIds
                  .map(shortName)
                  .join(" + ")})`
            )
            .join("; ")}
          .
        </p>

        <div className="relative mx-5 h-[72px]" aria-hidden="true">
          <div className="absolute left-0 right-0 top-[31px] h-0.5 bg-border" />
          {example.batches.map((batch, index) => {
            const left = axisX(batch.start);
            const width = Math.max(axisX(batch.end) - left, 1);

            return (
              <div
                key={batch.start}
                className="absolute top-5 h-6 rounded-sm border-[1.5px] border-primary/50 bg-primary/10"
                style={{ left: `${left}%`, width: `${width}%` }}
              >
                <span className="absolute -top-5 left-0 whitespace-nowrap text-xs font-semibold uppercase leading-4 tracking-[0.12em] text-primary">
                  {compactLabels ? index + 1 : `Партія ${index + 1}`}
                </span>
              </div>
            );
          })}
          {example.orders.map((order) => (
            <span
              key={order.minute}
              className="absolute top-6 h-4 w-4 -translate-x-1/2 rounded-full border-2 border-white shadow-sm"
              style={{ left: `${axisX(order.minute)}%`, backgroundColor: colorOf(order.filialId) }}
            />
          ))}
          {AXIS_TICKS.map((minute) => (
            <span
              key={minute}
              className="absolute top-[52px] -translate-x-1/2 text-[13px] leading-5 text-muted-foreground"
              style={{ left: `${axisX(minute)}%` }}
            >
              {formatMinuteOfDay(minute % 1440)}
            </span>
          ))}
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-2 text-[13px] leading-5">
          {legendIds.map((filialId) => (
            <span key={filialId} className="inline-flex items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: colorOf(filialId) }} />
              {shortName(filialId)}
            </span>
          ))}
        </div>
      </>
    );
  }

  return (
    <div className="space-y-3 rounded-2xl border border-border/70 bg-muted/30 p-4">
      <p className="text-sm font-semibold">Як це спрацює</p>
      {body}
    </div>
  );
}
