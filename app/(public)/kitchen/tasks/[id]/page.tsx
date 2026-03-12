import { TaskDetailView } from "@/features/tasks/task-detail-view";

export default async function KitchenTaskDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <TaskDetailView taskId={id} />;
}
