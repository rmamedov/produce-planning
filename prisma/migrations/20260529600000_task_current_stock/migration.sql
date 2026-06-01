-- Current stock on hand for the product (from the forecast snapshot).
ALTER TABLE "ProductionTask" ADD COLUMN "currentStockQty" DOUBLE PRECISION;
