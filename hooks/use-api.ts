"use client";

import {
  type QueryKey,
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions
} from "@tanstack/react-query";
import { toast } from "sonner";

type FetchConfig = RequestInit & {
  suppressToast?: boolean;
};

export async function apiClient<T>(input: string, init?: FetchConfig): Promise<T> {
  const isFormData = init?.body instanceof FormData;
  const response = await fetch(input, {
    ...init,
    headers: isFormData ? init?.headers : { "Content-Type": "application/json", ...init?.headers },
    cache: "no-store"
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { message?: string };
    throw new Error(payload.message ?? "Request failed");
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export function useApiQuery<T>(
  queryKey: QueryKey,
  url: string,
  options?: Omit<UseQueryOptions<T, Error, T, QueryKey>, "queryKey" | "queryFn">
) {
  return useQuery<T, Error, T, QueryKey>({
    queryKey,
    queryFn: () => apiClient<T>(url),
    ...options
  });
}

export function useApiMutation<TData, TVariables = void>(
  options: UseMutationOptions<TData, Error, TVariables> & {
    successMessage?: string;
    invalidateKeys?: QueryKey[];
  }
) {
  const queryClient = useQueryClient();

  return useMutation<TData, Error, TVariables>({
    ...options,
    onSuccess: async (data, variables, context) => {
      if (options.invalidateKeys?.length) {
        await Promise.all(
          options.invalidateKeys.map((queryKey) => queryClient.invalidateQueries({ queryKey }))
        );
      }

      if (options.successMessage) {
        toast.success(options.successMessage);
      }

      await options.onSuccess?.(data, variables, context);
    },
    onError: async (error, variables, context) => {
      toast.error(error.message);
      await options.onError?.(error, variables, context);
    }
  });
}
