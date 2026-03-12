"use client";

import { Toaster } from "sonner";

import { QueryProvider } from "@/components/providers/query-provider";

export function AppProvider({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      {children}
      <Toaster position="top-right" richColors closeButton />
    </QueryProvider>
  );
}
