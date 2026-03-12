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

export function getTimelinessLabel(status: TimelinessStatus) {
  return status === TimelinessStatus.OVERDUE ? "Прострочено" : "Вчасно";
}
