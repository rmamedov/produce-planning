-- Unit of measure (шт / кг) for the produce quantity, resolved from Silpo.
ALTER TABLE "ProductionTask" ADD COLUMN "lagerUnit" TEXT;
