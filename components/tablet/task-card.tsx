import Link from "next/link";
import { Clock3, ListTodo } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { TaskStatusActions } from "@/features/tasks/task-status-actions";
import { formatDateTime, getPriorityLabel } from "@/lib/format";
import type { TaskDto } from "@/types";

export function TaskCard({ task }: { task: TaskDto }) {
  return (
    <Card className="h-full border-white/60 bg-white/92">
      <CardContent className="flex h-full flex-col gap-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="line-clamp-2 text-base font-semibold leading-tight">{task.title}</p>
            <p className="text-xs text-muted-foreground">{task.branch.name}</p>
          </div>
          <Badge>{getPriorityLabel(task.priority)}</Badge>
        </div>

        <div className="grid grid-cols-2 gap-2 text-sm">
          <Metric label="Час" value={`${task.allocatedTimeMinutes} хв`} icon={<Clock3 className="h-4 w-4" />} />
          <Metric
            label="Готовність"
            value={formatDateTime(task.expectedReadyAt, "HH:mm")}
            icon={<ListTodo className="h-4 w-4" />}
          />
        </div>

        <p className="line-clamp-2 text-sm text-muted-foreground">{task.priorityReason}</p>

        <div className="mt-auto space-y-3">
          <TaskStatusActions task={task} compact />
          <Link href={`/kitchen/tasks/${task.id}`} className="block text-center text-sm font-semibold text-primary">
            Деталі завдання
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-muted/30 px-3 py-2">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
}
