import { describe, expect, it } from "vitest";
import { z } from "zod";

import { HttpError, handleApiError } from "@/api/http";
import { batchCompleteSchema, presentationSchema, taskIdsSchema } from "@/api/schemas";
import {
  buildFilialSummaries,
  comparePresentationNames,
  toPresentationData,
  toPresentationDto
} from "@/repositories/presentation.repository";
import {
  batchConflictMessage,
  splitByAffected
} from "@/services/production-tasks/production-task-workflow.service";

const WINDOW_MESSAGE = "Час групування — від 0,5 до 24 год, крок 0,5";

function issues(schema: z.ZodTypeAny, value: unknown): string[] {
  const result = schema.safeParse(value);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
}

const validPresentation = { name: "Лівобережна кухня", filial_ids: [3361, 2048], window_hours: 5 };

describe("presentationSchema", () => {
  it("accepts a valid presentation and trims the name", () => {
    expect(presentationSchema.parse({ ...validPresentation, name: "  Центр  " })).toEqual({
      name: "Центр",
      filial_ids: [3361, 2048],
      window_hours: 5
    });
  });

  it("accepts names of 2 and 40 characters", () => {
    expect(issues(presentationSchema, { ...validPresentation, name: "Ab" })).toEqual([]);
    expect(issues(presentationSchema, { ...validPresentation, name: "я".repeat(40) })).toEqual([]);
  });

  it("rejects too short names, counting after trim", () => {
    expect(issues(presentationSchema, { ...validPresentation, name: "Ц" })).toEqual([
      "Назва має містити щонайменше 2 символи"
    ]);
    expect(issues(presentationSchema, { ...validPresentation, name: "  Ц  " })).toEqual([
      "Назва має містити щонайменше 2 символи"
    ]);
  });

  it("rejects names longer than 40 characters", () => {
    expect(issues(presentationSchema, { ...validPresentation, name: "я".repeat(41) })).toEqual([
      "Назва — не довше 40 символів"
    ]);
  });

  it("requires at least 2 filials", () => {
    expect(issues(presentationSchema, { ...validPresentation, filial_ids: [3361] })).toEqual([
      "Оберіть щонайменше 2 філії"
    ]);
    expect(issues(presentationSchema, { ...validPresentation, filial_ids: [] })).toEqual([
      "Оберіть щонайменше 2 філії"
    ]);
  });

  it("rejects duplicate filials", () => {
    expect(issues(presentationSchema, { ...validPresentation, filial_ids: [3361, 3361] })).toEqual([
      "Філії не повинні повторюватися"
    ]);
  });

  it("rejects non-positive filial ids", () => {
    expect(issues(presentationSchema, { ...validPresentation, filial_ids: [3361, 0] })).not.toEqual([]);
  });

  it("accepts windows from 0,5 to 24 hours in 0,5 steps", () => {
    for (const window_hours of [0.5, 1, 7.5, 24]) {
      expect(issues(presentationSchema, { ...validPresentation, window_hours })).toEqual([]);
    }
  });

  it("rejects windows outside the range or off the 0,5 step", () => {
    for (const window_hours of [0, 0.25, 7.25, 24.5, 25]) {
      expect(issues(presentationSchema, { ...validPresentation, window_hours })).toContain(WINDOW_MESSAGE);
    }
  });

  it("explains a missing or non-numeric window with the same message", () => {
    expect(issues(presentationSchema, { ...validPresentation, window_hours: "abc" })).toEqual([WINDOW_MESSAGE]);
    expect(issues(presentationSchema, { name: "Центр", filial_ids: [1, 2] })).toEqual([WINDOW_MESSAGE]);
  });
});

describe("taskIdsSchema", () => {
  it("accepts a list of ids", () => {
    expect(taskIdsSchema.parse({ task_ids: ["a", "b"] })).toEqual({ task_ids: ["a", "b"] });
  });

  it("requires at least one id", () => {
    expect(issues(taskIdsSchema, { task_ids: [] })).toEqual(["Виберіть хоча б одну задачу"]);
  });

  it("rejects empty ids and more than 200 ids", () => {
    expect(issues(taskIdsSchema, { task_ids: [""] })).not.toEqual([]);
    const ids = Array.from({ length: 201 }, (_, index) => `t${index}`);
    expect(issues(taskIdsSchema, { task_ids: ids })).not.toEqual([]);
    expect(issues(taskIdsSchema, { task_ids: ids.slice(0, 200) })).toEqual([]);
  });
});

describe("batchCompleteSchema", () => {
  it("accepts positive quantities, including fractional kilograms", () => {
    const body = {
      items: [
        { task_id: "a", produced_qty: 24 },
        { task_id: "b", produced_qty: 1.5 }
      ]
    };
    expect(batchCompleteSchema.parse(body)).toEqual(body);
  });

  it("rejects a zero or negative quantity", () => {
    expect(issues(batchCompleteSchema, { items: [{ task_id: "a", produced_qty: 0 }] })).toEqual([
      "produced_qty має бути більшим за 0"
    ]);
    expect(issues(batchCompleteSchema, { items: [{ task_id: "a", produced_qty: -2 }] })).toEqual([
      "produced_qty має бути більшим за 0"
    ]);
  });

  it("rejects duplicate task ids", () => {
    expect(
      issues(batchCompleteSchema, {
        items: [
          { task_id: "a", produced_qty: 1 },
          { task_id: "a", produced_qty: 2 }
        ]
      })
    ).toEqual(["Задачі не повинні повторюватися"]);
  });

  it("rejects an empty list and a missing quantity", () => {
    expect(issues(batchCompleteSchema, { items: [] })).not.toEqual([]);
    expect(issues(batchCompleteSchema, { items: [{ task_id: "a" }] })).not.toEqual([]);
  });
});

describe("handleApiError", () => {
  it("sends an HttpError with its own status and message", async () => {
    const response = handleApiError(new HttpError(409, "Частину задач уже завершено"));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ message: "Частину задач уже завершено" });
  });

  it("maps HttpError statuses exactly, even when the message looks like another case", async () => {
    const response = handleApiError(new HttpError(400, "Presentation not found"));
    expect(response.status).toBe(400);
  });

  it("keeps the existing mappings", async () => {
    expect(handleApiError(new Error("Unauthorized")).status).toBe(401);
    expect(handleApiError(new Error("Production task not found")).status).toBe(404);
    expect(handleApiError(new Error("only NEW tasks can be started")).status).toBe(400);
    expect(handleApiError(new Error("boom")).status).toBe(500);

    const zodResponse = handleApiError(taskIdsSchema.safeParse({ task_ids: [] }).error);
    expect(zodResponse.status).toBe(400);
    expect((await zodResponse.json()).message).toBe("Validation failed");
  });

  it("is still an Error", () => {
    const error = new HttpError(404, "Presentation not found");
    expect(error).toBeInstanceOf(Error);
    expect(error.status).toBe(404);
    expect(error.message).toBe("Presentation not found");
  });
});

describe("presentation mapping", () => {
  it("stores hours as minutes and filials deduplicated in ascending order", () => {
    expect(toPresentationData({ name: " Центр ", filial_ids: [3361, 2043, 2048], window_hours: 7.5 })).toEqual({
      name: "Центр",
      filialIds: [2043, 2048, 3361],
      windowMinutes: 450
    });
    expect(toPresentationData({ name: "Центр", filial_ids: [1, 2], window_hours: 0.5 }).windowMinutes).toBe(30);
  });

  it("returns snake_case with hours derived from minutes", () => {
    expect(
      toPresentationDto({ id: "p1", name: "Центр", filialIds: [3361, 2048], windowMinutes: 300 })
    ).toEqual({ id: "p1", name: "Центр", filial_ids: [2048, 3361], window_minutes: 300, window_hours: 5 });
    expect(toPresentationDto({ id: "p2", name: "Х", filialIds: [], windowMinutes: 90 }).window_hours).toBe(1.5);
  });

  it("sorts names by the Ukrainian alphabet", () => {
    const names = ["Центр", "Ґанок", "Єва", "Дім", "Город", "Ірпінь", "Їжа"];
    expect(names.map((name) => ({ name })).sort(comparePresentationNames).map((row) => row.name)).toEqual([
      "Город",
      "Ґанок",
      "Дім",
      "Єва",
      "Ірпінь",
      "Їжа",
      "Центр"
    ]);
  });
});

describe("buildFilialSummaries", () => {
  it("merges filial ids, sorts them and attaches names and active counts", () => {
    expect(buildFilialSummaries([3361, 2048, 3361, 9999], new Map([[3361, 7]]))).toEqual([
      { filial_id: 2048, name: "Січових Стрільців (2048)", short_name: "Січових Стрільців", active_tasks: 0 },
      { filial_id: 3361, name: "Березнева (3361)", short_name: "Березнева", active_tasks: 7 },
      { filial_id: 9999, name: "Філія 9999", short_name: "Філія 9999", active_tasks: 0 }
    ]);
  });

  it("returns an empty list when nothing is known", () => {
    expect(buildFilialSummaries([], new Map())).toEqual([]);
  });
});

describe("batch helpers", () => {
  it("splits requested ids into affected and skipped, deduplicated in request order", () => {
    expect(splitByAffected(["c", "a", "b", "a", "d"], ["a", "d"])).toEqual({
      affected: ["a", "d"],
      skipped: ["c", "b"]
    });
    expect(splitByAffected(["a"], [])).toEqual({ affected: [], skipped: ["a"] });
  });

  it("names each affected product once in the conflict message", () => {
    expect(batchConflictMessage(["Круасан", "Багет", "Круасан"])).toBe(
      "Частину задач уже завершено або скасовано на іншому планшеті: Круасан, Багет. Оновіть дошку."
    );
  });
});
