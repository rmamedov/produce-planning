import { ArrowUpRight } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

export function StatCard({
  title,
  value,
  hint
}: {
  title: string;
  value: number | string;
  hint?: string;
}) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="flex items-start justify-between gap-4 p-5">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{title}</p>
          <p className="text-3xl font-semibold tracking-tight">{value}</p>
          {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
        </div>
        <div className="rounded-2xl bg-primary/10 p-3 text-primary">
          <ArrowUpRight className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}
