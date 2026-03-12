import Link from "next/link";
import { BookOpen, ChevronRight, LayoutDashboard, Tablet } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default function HomePage() {
  return (
    <main className="page-shell flex min-h-screen items-center">
      <div className="grid w-full gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Kitchen Operations Platform</p>
            <h1 className="max-w-3xl text-5xl font-semibold leading-tight tracking-tight">
              Планування виробництва кулінарії для магазинів без ручних таблиць.
            </h1>
            <p className="max-w-2xl text-lg text-muted-foreground">
              Система планує задачі на 4 години вперед, враховує залишки, прогноз продажів і технологічні карти та
              надає окремий інтерфейс для кухні і для адміністрування.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link href="/admin" className={cn(buttonVariants({ size: "lg" }))}>
              Адмін-панель
              <ChevronRight className="ml-2 h-4 w-4" />
            </Link>
            <Link href="/kitchen" className={cn(buttonVariants({ size: "lg", variant: "outline" }))}>
              Kitchen tablet
              <ChevronRight className="ml-2 h-4 w-4" />
            </Link>
            <Link href="/guide" className={cn(buttonVariants({ size: "lg", variant: "outline" }))}>
              Інструкція
              <BookOpen className="ml-2 h-4 w-4" />
            </Link>
          </div>
        </div>

        <div className="grid gap-4">
          <Card className="overflow-hidden border-primary/15 bg-gradient-to-br from-white to-emerald-50">
            <CardContent className="space-y-3 p-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <LayoutDashboard className="h-6 w-6" />
              </div>
              <h2 className="text-xl font-semibold">Адмін-панель</h2>
              <p className="text-sm text-muted-foreground">
                CRUD для філій, асортименту, товарів, техкарт, прогнозів, задач і ручного створення завдань.
              </p>
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-accent/15 bg-gradient-to-br from-white to-orange-50">
            <CardContent className="space-y-3 p-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10 text-accent">
                <Tablet className="h-6 w-6" />
              </div>
              <h2 className="text-xl font-semibold">Tablet UI</h2>
              <p className="text-sm text-muted-foreground">
                Компактні картки задач, що вміщують 3-5 задач на екрані 1340x800 і показують тільки допустимі дії.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
