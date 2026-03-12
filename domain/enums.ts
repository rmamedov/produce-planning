export const TaskStatus = {
  NEW: "NEW",
  IN_PROGRESS: "IN_PROGRESS",
  DONE: "DONE",
  CANCELLED: "CANCELLED"
} as const;

export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus];

export const TimelinessStatus = {
  ON_TIME: "ON_TIME",
  OVERDUE: "OVERDUE"
} as const;

export type TimelinessStatus = (typeof TimelinessStatus)[keyof typeof TimelinessStatus];

export const TaskPriority = {
  CRITICAL: "CRITICAL",
  HIGH: "HIGH",
  MEDIUM: "MEDIUM",
  LOW: "LOW"
} as const;

export type TaskPriority = (typeof TaskPriority)[keyof typeof TaskPriority];
