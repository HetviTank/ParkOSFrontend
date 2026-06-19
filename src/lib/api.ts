import type { LoginRequest, LoginResponse, ForgotPasswordRequest, ConfirmForgotPasswordRequest } from "@/types/auth";
import type { DashboardResponse } from "@/types/dashboard";

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Something went wrong." }));
    throw new Error(err.detail ?? "Request failed.");
  }

  const text = await res.text();
  return text ? JSON.parse(text) : ({} as T);
}

export const authApi = {
  login: (body: LoginRequest) =>
    request<LoginResponse>("/login", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  forgotPassword: (body: ForgotPasswordRequest) =>
    request<{ message: string }>("/forgot-password", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  confirmForgotPassword: (body: ConfirmForgotPasswordRequest) =>
    request<{ message: string }>("/forgot-password", {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  refreshAccessToken: (refresh_token: string) =>
    request<{ access_token: string }>("/refresh-access-token", {
      method: "POST",
      body: JSON.stringify({ refresh_token }),
    }),
};

export const dashboardApi = {
  get: (token: string, locationId?: string) =>
    request<DashboardResponse>(
      `/dashboard${locationId ? `?location_id=${locationId}` : ""}`,
      { headers: { token } as Record<string, string> }
    ),
};
