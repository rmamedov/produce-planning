-- Reason a task could not be produced (set when cancelled from the board).
ALTER TABLE "ProductionTask" ADD COLUMN "cancelReason" TEXT;
