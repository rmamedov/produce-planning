"use client";

import { usePathname } from "next/navigation";

import { LogoutButton } from "@/components/admin/logout-button";

const labels: Record<string, string> = {
  admin: "Dashboard",
  branches: "Філії",
  assortments: "Асортимент",
  products: "Товари",
  "tech-cards": "Технологічні карти",
  forecasts: "Прогнози",
  tasks: "Завдання",
  "manual-tasks": "Ручне створення завдання",
  "task-generator": "Генерація задач",
  settings: "Налаштування"
};

export function AdminHeader() {
  const pathname = usePathname();
  const section = pathname.split("/")[2] || "admin";

  return (
    <header className="panel-surface flex items-center justify-between gap-4 px-5 py-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Admin panel</p>
        <h1 className="text-xl font-semibold tracking-tight">{labels[section] ?? "Адмін-панель"}</h1>
      </div>
      <LogoutButton />
    </header>
  );
}
