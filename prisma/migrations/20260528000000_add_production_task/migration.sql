-- CreateTable
CREATE TABLE "ProductionTask" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "filialId" INTEGER NOT NULL,
    "lagerId" INTEGER NOT NULL,
    "historyDate" DATE NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'NEW',
    "priority" "TaskPriority" NOT NULL,
    "priorityLevel" INTEGER NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "coveredHours" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ProductionTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductionTask_sourceId_key" ON "ProductionTask"("sourceId");

-- CreateIndex
CREATE INDEX "ProductionTask_filialId_idx" ON "ProductionTask"("filialId");

-- CreateIndex
CREATE INDEX "ProductionTask_filialId_historyDate_idx" ON "ProductionTask"("filialId", "historyDate");

-- CreateIndex
CREATE INDEX "ProductionTask_status_idx" ON "ProductionTask"("status");

-- CreateIndex
CREATE INDEX "ProductionTask_priority_idx" ON "ProductionTask"("priority");

-- AddForeignKey
ALTER TABLE "ProductionTask" ADD CONSTRAINT "ProductionTask_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "ProductionPlanPriority"("id") ON DELETE CASCADE ON UPDATE CASCADE;
