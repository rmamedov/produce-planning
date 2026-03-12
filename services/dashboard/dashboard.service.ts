import { dashboardRepository } from "@/repositories/dashboard.repository";

export const dashboardService = {
  getStats() {
    return dashboardRepository.getStats();
  }
};
