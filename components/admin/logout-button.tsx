"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";

export function LogoutButton() {
  const router = useRouter();

  return (
    <Button
      variant="outline"
      onClick={async () => {
        await fetch("/api/auth/logout", {
          method: "POST"
        });
        router.replace("/admin/login");
      }}
    >
      <LogOut className="mr-2 h-4 w-4" />
      Вийти
    </Button>
  );
}
