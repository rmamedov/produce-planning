-- CreateTable
CREATE TABLE "TaskStatusLog" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskStatusLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskStatusLog_taskId_idx" ON "TaskStatusLog"("taskId");

-- CreateIndex
CREATE INDEX "TaskStatusLog_changedAt_idx" ON "TaskStatusLog"("changedAt");

-- AddForeignKey
ALTER TABLE "TaskStatusLog" ADD CONSTRAINT "TaskStatusLog_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
