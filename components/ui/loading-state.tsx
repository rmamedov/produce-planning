import { LoaderCircle } from "lucide-react";

export function LoadingState({ label = "Завантаження..." }: { label?: string }) {
  return (
    <div className="flex min-h-48 items-center justify-center gap-3 rounded-3xl border border-border/70 bg-white/70 px-6 py-10 text-sm text-muted-foreground">
      <LoaderCircle className="h-5 w-5 animate-spin" />
      <span>{label}</span>
    </div>
  );
}
