import { LoginForm } from "@/features/auth/login-form";

export default function AdminLoginPage() {
  return (
    <main className="page-shell flex min-h-screen items-center justify-center">
      <div className="w-full max-w-md">
        <LoginForm />
      </div>
    </main>
  );
}
