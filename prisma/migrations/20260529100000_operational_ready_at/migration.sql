-- Operational readiness deadline: forecast receipt time + covered_hours.
ALTER TABLE "ProductionTask" ADD COLUMN "operationalReadyAt" TIMESTAMP(3);
