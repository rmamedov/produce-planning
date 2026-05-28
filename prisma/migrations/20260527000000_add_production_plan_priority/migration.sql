-- CreateTable
CREATE TABLE "ProductionPlanPriority" (
    "id" TEXT NOT NULL,
    "filialId" INTEGER NOT NULL,
    "historyDate" DATE NOT NULL,
    "snapshotHour" INTEGER,
    "lagerId" INTEGER NOT NULL,
    "priority" INTEGER NOT NULL,
    "coveredHours" DOUBLE PRECISION NOT NULL,
    "currentStockQty" DOUBLE PRECISION NOT NULL,
    "demandTillDayEnd" DOUBLE PRECISION NOT NULL,
    "demandWholeDay" DOUBLE PRECISION NOT NULL,
    "recommendedToProduce" DOUBLE PRECISION NOT NULL,
    "salesQty" DOUBLE PRECISION NOT NULL,
    "producedQty" DOUBLE PRECISION NOT NULL,
    "demandBeforeQty" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionPlanPriority_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductionPlanPriority_filialId_idx" ON "ProductionPlanPriority"("filialId");

-- CreateIndex
CREATE INDEX "ProductionPlanPriority_filialId_historyDate_idx" ON "ProductionPlanPriority"("filialId", "historyDate");

-- CreateIndex
CREATE INDEX "ProductionPlanPriority_priority_idx" ON "ProductionPlanPriority"("priority");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionPlanPriority_filialId_historyDate_lagerId_key" ON "ProductionPlanPriority"("filialId", "historyDate", "lagerId");
