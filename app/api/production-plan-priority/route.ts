import { NextRequest, NextResponse } from "next/server";

import { handleApiError, ok, parseJsonBody } from "@/api/http";
import {
  productionPlanPriorityIngestSchema,
  productionPlanPriorityQuerySchema
} from "@/api/schemas";
import { productionPlanPriorityRepository } from "@/repositories/production-plan-priority.repository";
import { productionTaskGenerationService } from "@/services/production-tasks/production-task-generation.service";

export async function POST(request: Request) {
  try {
    const body = productionPlanPriorityIngestSchema.parse(
      await parseJsonBody(request)
    );

    const items = body.dates.flatMap((dateEntry) =>
      dateEntry.items.map((item) => ({
        filialId: body.filial_id,
        historyDate: new Date(dateEntry.history_date),
        snapshotHour: dateEntry.snapshot_hour,
        lagerId: item.lager_id,
        priority: item.priority,
        coveredHours: item.covered_hours,
        currentStockQty: item.current_stock_qty,
        demandTillDayEnd: item.demand_till_day_end,
        demandWholeDay: item.demand_whole_day,
        recommendedToProduce: item.recommended_to_produce,
        salesQty: item.sales_qty,
        producedQty: item.produced_qty,
        demandBeforeQty: item.demand_before_qty
      }))
    );

    const result = await productionPlanPriorityRepository.upsertMany(items);

    // Automatically (re)generate production tasks from the freshly ingested plan.
    const tasks = await productionTaskGenerationService.generate(body.filial_id);

    return ok({ upserted: result.length, tasks }, 201);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    const filialIdParam = searchParams.get("filial_id");
    if (!filialIdParam) {
      return NextResponse.json(
        { error: "INVALID_REQUEST", message: "filial_id is required and must be a positive integer" },
        { status: 400 }
      );
    }

    const query = productionPlanPriorityQuerySchema.parse({
      filial_id: filialIdParam,
      history_date: searchParams.get("history_date") ?? undefined,
      priority: searchParams.get("priority") ?? undefined,
      lager_id: searchParams.get("lager_id") ?? undefined
    });

    const rows = await productionPlanPriorityRepository.list({
      filialId: query.filial_id,
      historyDate: query.history_date ? new Date(query.history_date) : undefined,
      priority: query.priority,
      lagerId: query.lager_id
    });

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "NO_DATA", message: `No production plan data found for filial_id ${query.filial_id}` },
        { status: 404 }
      );
    }

    const grouped = new Map<string, {
      history_date: string;
      snapshot_hour: number | null;
      items: Array<{
        lager_id: number;
        priority: number;
        covered_hours: number;
        current_stock_qty: number;
        demand_till_day_end: number;
        demand_whole_day: number;
        recommended_to_produce: number;
        sales_qty: number;
        produced_qty: number;
        demand_before_qty: number;
      }>;
    }>();

    for (const row of rows) {
      const dateKey = row.historyDate.toISOString().split("T")[0];

      if (!grouped.has(dateKey)) {
        grouped.set(dateKey, {
          history_date: dateKey,
          snapshot_hour: row.snapshotHour,
          items: []
        });
      }

      grouped.get(dateKey)!.items.push({
        lager_id: row.lagerId,
        priority: row.priority,
        covered_hours: row.coveredHours,
        current_stock_qty: row.currentStockQty,
        demand_till_day_end: row.demandTillDayEnd,
        demand_whole_day: row.demandWholeDay,
        recommended_to_produce: row.recommendedToProduce,
        sales_qty: row.salesQty,
        produced_qty: row.producedQty,
        demand_before_qty: row.demandBeforeQty
      });
    }

    return ok({
      filial_id: query.filial_id,
      generated_at: new Date().toISOString(),
      dates: Array.from(grouped.values())
    });
  } catch (error) {
    return handleApiError(error);
  }
}
