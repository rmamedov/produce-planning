"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Blocks,
  CalendarClock,
  ChefHat,
  ClipboardList,
  Factory,
  LayoutDashboard,
  Settings,
  ShoppingBasket,
  Sparkles,
  Store,
  Wrench
} from "lucide-react";

import { cn } from "@/lib/utils";

const items = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/branches", label: "Філії", icon: Store },
  { href: "/admin/assortments", label: "Асортимент", icon: Blocks },
  { href: "/admin/products", label: "Товари", icon: ShoppingBasket },
  { href: "/admin/tech-cards", label: "Технологічні карти", icon: ChefHat },
  { href: "/admin/forecasts", label: "Прогнози", icon: CalendarClock },
  { href: "/admin/tasks", label: "Завдання", icon: ClipboardList },
  { href: "/admin/manual-tasks", label: "Ручне створення завдання", icon: Wrench },
  { href: "/admin/task-generator", label: "Генерація задач", icon: Sparkles },
  { href: "/admin/settings", label: "Налаштування", icon: Settings }
];

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="panel-surface sticky top-6 hidden h-[calc(100vh-3rem)] min-w-72 flex-col justify-between overflow-hidden lg:flex">
      <div className="space-y-8 p-6">
        <div className="space-y-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-primary/10 text-primary">
            <Factory className="h-7 w-7" />
          </div>
          <div className="space-y-1">
            <h2 className="text-xl font-semibold tracking-tight">Kitchen Planner</h2>
            <p className="text-sm text-muted-foreground">Планування виробництва для мережі магазинів</p>
          </div>
        </div>

        <nav className="space-y-2">
          {items.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition",
                  isActive ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted"
                )}
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="space-y-3 border-t border-border/70 p-6 text-sm text-muted-foreground">
        <p>Kitchen board: мінімум 3 картки задач на екрані 1340x800.</p>
        <Link href="/kitchen" className="font-semibold text-primary">
          Відкрити tablet UI
        </Link>
      </div>
    </aside>
  );
}
