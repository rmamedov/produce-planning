-- Snapshot hour (Kyiv) from the forecast, needed to compute live coverage.
ALTER TABLE "ProductionTask" ADD COLUMN "snapshotHour" INTEGER;
