-- Partial uniqueness for the "one active task per branch and product" invariant.
CREATE UNIQUE INDEX IF NOT EXISTS task_branch_product_active_unique
ON "Task" ("branchId", "productId")
WHERE "status" IN ('NEW', 'IN_PROGRESS');
