import Image from "next/image";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { TaskStatusActions } from "@/features/tasks/task-status-actions";
import {
  formatDateTime,
  getPriorityBadgeClassName,
  getPriorityLabel,
  getPrioritySurfaceClassName,
  getStatusLabel,
  getTimelinessLabel
} from "@/lib/format";
import { cn } from "@/lib/utils";
import type { TaskDto } from "@/types";

export function TaskDetailContent({ task }: { task: TaskDto }) {
  return (
    <div className="space-y-6">
      <Card className={cn("overflow-hidden", getPrioritySurfaceClassName(task.priority))}>
        {task.product.photoUrl ? (
          <div className="relative h-64 w-full overflow-hidden">
            <Image
              src={task.product.photoUrl}
              alt={task.product.name}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 720px"
            />
          </div>
        ) : null}
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={getPriorityBadgeClassName(task.priority)}>{getPriorityLabel(task.priority)}</Badge>
            <Badge variant={task.timelinessStatus === "OVERDUE" ? "destructive" : "success"}>
              {getTimelinessLabel(task.timelinessStatus)}
            </Badge>
            <Badge variant="outline">{getStatusLabel(task.status)}</Badge>
          </div>
          <CardTitle className="text-2xl">{task.title}</CardTitle>
          <p className="text-sm text-muted-foreground">{task.priorityReason}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <InfoItem label="Філія" value={task.branch.name} />
            <InfoItem label="Очікувана готовність" value={formatDateTime(task.expectedReadyAt)} />
            <InfoItem label="Створено" value={formatDateTime(task.createdAt)} />
            <InfoItem label="Виділений час" value={`${task.allocatedTimeMinutes} хв`} />
            <InfoItem label="Почато" value={formatDateTime(task.startedAt)} />
            <InfoItem label="Завершено" value={formatDateTime(task.completedAt)} />
          </div>
          <TaskStatusActions task={task} />
        </CardContent>
      </Card>

      {task.product.technologicalCard ? (
        <Card>
          <CardHeader>
            <CardTitle>Технологічна карта: {task.product.technologicalCard.name}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <section className="space-y-3">
              <h3 className="font-semibold">Інгредієнти</h3>
              <div className="grid gap-2">
                {task.product.technologicalCard.ingredients.map((ingredient) => (
                  <div key={ingredient.id} className="flex items-center justify-between rounded-2xl bg-muted/30 px-4 py-3">
                    <span>{ingredient.ingredientName}</span>
                    <span className="text-sm text-muted-foreground">
                      {ingredient.quantity} {ingredient.unit}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <Separator />

            <section className="space-y-3">
              <h3 className="font-semibold">Кроки</h3>
              <div className="grid gap-3">
                {task.product.technologicalCard.steps.map((step) => (
                  <div key={step.id} className="rounded-2xl border border-border/70 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">Крок {step.stepNumber}</p>
                    <p className="mt-2 text-sm">{step.description}</p>
                  </div>
                ))}
              </div>
            </section>

            <Separator />

            <section className="space-y-3">
              <h3 className="font-semibold">Обладнання</h3>
              <div className="flex flex-wrap gap-2">
                {task.product.technologicalCard.requiredEquipment.map((equipment) => (
                  <Badge key={equipment.id} variant="secondary">
                    {equipment.label}
                  </Badge>
                ))}
              </div>
            </section>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/70 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className="mt-1 font-medium">{value || "—"}</p>
    </div>
  );
}
