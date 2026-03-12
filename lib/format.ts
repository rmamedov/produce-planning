import { format, formatDistanceToNowStrict } from "date-fns";

import { TaskPriority, TaskStatus, TimelinessStatus } from "@/domain/enums";

export function formatDateTime(value: string | Date | null | undefined, pattern = "dd.MM.yyyy HH:mm") {
  if (!value) {
    return "—";
  }

  return format(new Date(value), pattern);
}

export function formatRelative(value: string | Date | null | undefined) {
  if (!value) {
    return "—";
  }

  return formatDistanceToNowStrict(new Date(value), { addSuffix: true });
}

export function getStatusLabel(status: TaskStatus) {
  switch (status) {
    case TaskStatus.NEW:
      return "Нове";
    case TaskStatus.IN_PROGRESS:
      return "Готується";
    case TaskStatus.DONE:
      return "Готово";
    case TaskStatus.CANCELLED:
      return "Неможливо виготовити";
    default:
      return status;
  }
}

export function getPriorityLabel(priority: TaskPriority) {
  switch (priority) {
    case TaskPriority.CRITICAL:
      return "Critical";
    case TaskPriority.HIGH:
      return "High";
    case TaskPriority.MEDIUM:
      return "Medium";
    case TaskPriority.LOW:
      return "Low";
    default:
      return priority;
  }
}

export function getPriorityBadgeClassName(priority: TaskPriority) {
  switch (priority) {
    case TaskPriority.CRITICAL:
      return "bg-red-100 text-red-800";
    case TaskPriority.HIGH:
      return "bg-orange-100 text-orange-800";
    case TaskPriority.MEDIUM:
      return "bg-amber-100 text-amber-800";
    case TaskPriority.LOW:
      return "bg-emerald-100 text-emerald-800";
    default:
      return "";
  }
}

export function getPrioritySurfaceClassName(priority: TaskPriority) {
  switch (priority) {
    case TaskPriority.CRITICAL:
      return "border-red-200 bg-red-50/95";
    case TaskPriority.HIGH:
      return "border-orange-200 bg-orange-50/95";
    case TaskPriority.MEDIUM:
      return "border-amber-200 bg-amber-50/95";
    case TaskPriority.LOW:
      return "border-emerald-200 bg-emerald-50/95";
    default:
      return "border-white/60 bg-white/92";
  }
}

export function getTimelinessLabel(status: TimelinessStatus) {
  return status === TimelinessStatus.OVERDUE ? "Прострочено" : "Вчасно";
}
