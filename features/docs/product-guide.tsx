import type { ComponentType } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Boxes,
  ChefHat,
  ClipboardList,
  Factory,
  Layers3,
  ShieldCheck,
  Tablet
} from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

const interfaces = [
  {
    title: "Tablet UI для кухні",
    icon: Tablet,
    points: [
      "Відкрийте board, виберіть філію у фільтрі та працюйте тільки з її задачами.",
      "Картка задачі показує назву, кількість, пріоритет, час, дедлайн та причину пріоритету.",
      "Основна кнопка залежить від статусу: для NEW це Почати виконання, для IN_PROGRESS це Готово.",
      "Дія Неможливо виготовити схована в меню з трьома крапками і доступна для NEW та IN_PROGRESS.",
      "Екран деталей показує фото товару, технологічну карту, інгредієнти, кроки, обладнання та ті самі статусні дії."
    ]
  },
  {
    title: "Адмін-панель",
    icon: ShieldCheck,
    points: [
      "Dashboard показує стан мережі: філії, товари, активні задачі, прострочення та критичні позиції.",
      "Філії, асортимент, товари, техкарти та прогнози керують вхідними даними для алгоритму.",
      "Завдання показують усі автоматичні та ручні записи по мережі.",
      "Ручне створення завдання дозволяє створити або оновити active task для конкретного товару у філії.",
      "Налаштування задають горизонт планування, інтервал генерації та параметри kitchen board."
    ]
  }
];

const entities = [
  {
    title: "Branch",
    fields: "id, name, address",
    description: "Окремий магазин, для якого ведеться асортимент, прогноз та виробничі задачі."
  },
  {
    title: "Assortment",
    fields: "id, branchId, items[]",
    description: "Набір товарів конкретної філії. На рівні item зберігаються currentStock та hourlyTargetStock."
  },
  {
    title: "Product",
    fields: "id, name, photoUrl, unitWeight, technologicalCardId",
    description: "Товар кулінарії. Один товар може входити в асортимент кількох філій."
  },
  {
    title: "Technological Card",
    fields: "id, name, ingredients, steps, requiredEquipment, typicalCookingTimeMinutes",
    description: "Описує як готувати товар: склад, процес та обладнання."
  },
  {
    title: "Forecast",
    fields: "id, branchId, productId, hour, forecastedSalesQty",
    description: "Погодинний прогноз продажів, який використовується алгоритмом генерації задач."
  },
  {
    title: "Task",
    fields:
      "id, branchId, productId, quantity, title, status, timelinessStatus, priority, expectedReadyAt, manual",
    description: "Виробниче завдання. Важливе правило: одна задача містить тільки один товар."
  }
];

const statuses = [
  {
    title: "Основні статуси",
    values: ["NEW: нове завдання, ще не взяте в роботу.", "IN_PROGRESS: кухар почав виконання.", "DONE: завдання завершене.", "CANCELLED: виготовити неможливо."]
  },
  {
    title: "Timeliness статуси",
    values: ["ON_TIME: дедлайн ще не порушений.", "OVERDUE: очікувана готовність уже в минулому."]
  },
  {
    title: "Дозволені переходи",
    values: [
      "NEW -> IN_PROGRESS через кнопку Почати виконання.",
      "NEW -> CANCELLED через дію Неможливо виготовити в меню.",
      "IN_PROGRESS -> DONE через кнопку Готово.",
      "IN_PROGRESS -> CANCELLED через дію Неможливо виготовити в меню."
    ]
  }
];

const productRules = [
  "Ціль продукту: автоматично планувати виробництво кулінарії на 4 години вперед без ручних таблиць.",
  "Алгоритм враховує поточний залишок, активні задачі, прогноз продажів, цільовий запас та час приготування.",
  "Для одного branchId + productId може існувати лише одне active task у статусі NEW або IN_PROGRESS.",
  "Назва задачі формується автоматично у форматі product.name — quantity шт.",
  "Пріоритети впливають на візуальне кодування: Critical червоний, Medium жовтий, Low зелений."
];

export function ProductGuide() {
  return (
    <main className="page-shell min-h-screen space-y-8">
      <PageHeader
        eyebrow="Product guide"
        title="Інструкція по роботі з системою"
        description="Окремий довідник по цілі продукту, сутностях, статусах та щоденному користуванню tablet UI і адмін-панеллю."
        actions={
          <>
            <Link href="/admin" className={cn(buttonVariants())}>
              Відкрити адмін-панель
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
            <Link href="/kitchen" className={cn(buttonVariants({ variant: "outline" }))}>
              Відкрити tablet UI
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </>
        }
      />

      <section className="grid gap-4 lg:grid-cols-3">
        <GuideIntroCard
          title="Ціль продукту"
          description="Платформа автоматично створює задачі на виробництво кулінарних товарів для мережі магазинів."
          icon={Factory}
        />
        <GuideIntroCard
          title="Дві ролі"
          description="Кухня працює у tablet UI, а адміністратор керує довідниками, прогнозом і ручними задачами."
          icon={Layers3}
        />
        <GuideIntroCard
          title="Що всередині"
          description="Система знає сутності, статуси, пріоритети та правила переходів, тому UI показує тільки допустимі дії."
          icon={BookOpen}
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Ключові правила продукту</CardTitle>
          <CardDescription>Коротко про бізнес-логіку, яку повинен розуміти кожен користувач.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {productRules.map((rule) => (
            <div key={rule} className="rounded-2xl bg-muted/35 px-4 py-3 text-sm">
              {rule}
            </div>
          ))}
        </CardContent>
      </Card>

      <section className="grid gap-6 xl:grid-cols-2">
        {interfaces.map((section) => {
          const Icon = section.icon;

          return (
            <Card key={section.title}>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle>{section.title}</CardTitle>
                    <CardDescription>Покроковий сценарій використання інтерфейсу.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <ol className="space-y-3">
                  {section.points.map((point, index) => (
                    <li key={point} className="flex gap-3 rounded-2xl bg-muted/35 px-4 py-3 text-sm">
                      <Badge className="mt-0.5 h-fit min-w-7 justify-center">{index + 1}</Badge>
                      <span>{point}</span>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          );
        })}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent/10 text-accent">
                <Boxes className="h-5 w-5" />
              </div>
              <div>
                <CardTitle>Сутності системи</CardTitle>
                <CardDescription>Що зберігається в моделі даних і для чого це потрібно.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid gap-3">
            {entities.map((entity) => (
              <div key={entity.title} className="rounded-2xl border border-border/70 bg-white/70 px-4 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold">{entity.title}</h3>
                  <Badge variant="outline">{entity.fields}</Badge>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{entity.description}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <ClipboardList className="h-5 w-5" />
              </div>
              <div>
                <CardTitle>Статуси задач</CardTitle>
                <CardDescription>Які стани бачить користувач і які переходи дозволені.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {statuses.map((group, index) => (
              <div key={group.title} className="space-y-3">
                <div>
                  <h3 className="font-semibold">{group.title}</h3>
                </div>
                <div className="grid gap-2">
                  {group.values.map((value) => (
                    <div key={value} className="rounded-2xl bg-muted/35 px-4 py-3 text-sm">
                      {value}
                    </div>
                  ))}
                </div>
                {index < statuses.length - 1 ? <Separator /> : null}
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-white to-emerald-50">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <ChefHat className="h-5 w-5" />
            </div>
            <div>
              <CardTitle>Практична схема роботи</CardTitle>
              <CardDescription>Як зазвичай виглядає операційний цикл у системі.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          {[
            "Адміністратор підтримує філії, асортимент, товари, техкарти і прогнози.",
            "Система генерує задачі на основі запасу, прогнозу та цільового рівня залишку.",
            "Кухня бере задачу в роботу через tablet UI і доводить її до DONE або CANCELLED.",
            "Після завершення запас оновлюється, а генератор перераховує наступні задачі."
          ].map((step, index) => (
            <div key={step} className="rounded-2xl bg-white/80 px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Крок {index + 1}</p>
              <p className="mt-2 text-sm text-muted-foreground">{step}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </main>
  );
}

function GuideIntroCard({
  title,
  description,
  icon: Icon
}: {
  title: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
}) {
  return (
    <Card className="overflow-hidden border-white/60 bg-white/88">
      <CardContent className="space-y-3 p-6">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Icon className="h-6 w-6" />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </CardContent>
    </Card>
  );
}
