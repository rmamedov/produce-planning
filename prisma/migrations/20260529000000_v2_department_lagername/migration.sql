-- API V2: add department + product full name, relax sales/produced to nullable.

-- AddColumn
ALTER TABLE "ProductionPlanPriority" ADD COLUMN "departmentId" INTEGER;
ALTER TABLE "ProductionPlanPriority" ADD COLUMN "lagerFullName" TEXT;

-- Relax previously-required metrics to nullable
ALTER TABLE "ProductionPlanPriority" ALTER COLUMN "salesQty" DROP NOT NULL;
ALTER TABLE "ProductionPlanPriority" ALTER COLUMN "producedQty" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "ProductionPlanPriority_departmentId_idx" ON "ProductionPlanPriority"("departmentId");
