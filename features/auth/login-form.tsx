"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { KeyRound } from "lucide-react";

import { apiClient, useApiMutation } from "@/hooks/use-api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/form-error";
import { FormGrid } from "@/components/ui/form-grid";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginSchema } from "@/api/schemas";

type LoginFormValues = z.infer<typeof loginSchema>;

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirectTo") || "/admin";

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: ""
    }
  });

  const mutation = useApiMutation({
    mutationFn: (values: LoginFormValues) =>
      apiClient<{ success: boolean }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(values)
      }),
    onSuccess: async () => {
      router.replace(redirectTo);
      router.refresh();
    }
  });

  return (
    <Card className="overflow-hidden border-primary/15 bg-white/90">
      <CardHeader className="space-y-4 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl bg-primary/10 text-primary">
          <KeyRound className="h-6 w-6" />
        </div>
        <div className="space-y-1">
          <CardTitle className="text-2xl">Вхід в адмін-панель</CardTitle>
          <CardDescription>Увійдіть під обліковими даними адміністратора для керування виробництвом.</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <form className="space-y-5" onSubmit={form.handleSubmit((values) => mutation.mutate(values))}>
          <FormGrid>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="admin@example.com" {...form.register("email")} />
              <FormError message={form.formState.errors.email?.message} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Пароль</Label>
              <Input id="password" type="password" placeholder="••••••••" {...form.register("password")} />
              <FormError message={form.formState.errors.password?.message} />
            </div>
          </FormGrid>

          <Button className="w-full" size="lg" type="submit" disabled={mutation.isPending}>
            Увійти
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
