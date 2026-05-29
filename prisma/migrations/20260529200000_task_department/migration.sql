-- Denormalize department onto the task so the board can filter by it.
ALTER TABLE "ProductionTask" ADD COLUMN "departmentId" INTEGER;
CREATE INDEX "ProductionTask_departmentId_idx" ON "ProductionTask"("departmentId");
