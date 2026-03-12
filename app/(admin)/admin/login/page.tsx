import { Suspense } from "react";

import { LoginForm } from "@/features/auth/login-form";
import { LoadingState } from "@/components/ui/loading-state";

export default function AdminLoginPage() {
  return (
    <main className="page-shell flex min-h-screen items-center justify-center">
      <div className="w-full max-w-md">
        <Suspense fallback={<LoadingState label="Підготовка форми входу..." />}>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
