import { handleApiError, ok } from "@/api/http";
import { taskRepository } from "@/repositories/task.repository";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const task = await taskRepository.getById(id);
    if (!task) {
      throw new Error("Task not found");
    }
    return ok(task);
  } catch (error) {
    return handleApiError(error);
  }
}
