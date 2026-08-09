import type { ApiErrorResponse } from "@valtic/types";
import { useAuthStore } from "@/stores/auth-store";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api/v1";

export class ApiError extends Error {
  constructor(public readonly response: ApiErrorResponse) {
    super(response.message);
    this.name = "ApiError";
  }
}

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  skipAuthRetry?: boolean;
}

let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      credentials: "include",
      headers: { "X-Requested-With": "XMLHttpRequest" },
    })
      .then(async (response) => {
        if (!response.ok) {
          return null;
        }
        const data = (await response.json()) as { accessToken: string };
        useAuthStore.getState().setAccessToken(data.accessToken);
        return data.accessToken;
      })
      .catch(() => null)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, headers, skipAuthRetry, ...rest } = options;
  const accessToken = useAuthStore.getState().accessToken;
  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;

  const response = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers: {
      // FormData necesita que el navegador ponga su propio Content-Type
      // (con el boundary del multipart); si lo fijamos nosotros, se rompe.
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      // Requerido por CsrfHeaderGuard en los endpoints que dependen solo de
      // la cookie httpOnly (/auth/refresh, /auth/logout); inofensivo en el resto.
      "X-Requested-With": "XMLHttpRequest",
      ...headers,
    },
    body: isFormData ? (body as FormData) : body !== undefined ? JSON.stringify(body) : undefined,
    credentials: "include",
  });

  if (response.status === 401 && !skipAuthRetry) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      return request<T>(path, { ...options, skipAuthRetry: true });
    }
    useAuthStore.getState().clear();
  }

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as ApiErrorResponse | null;
    if (errorBody) {
      throw new ApiError(errorBody);
    }
    throw new Error(`Error de red: ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

async function downloadFile(path: string, fileName: string, skipAuthRetry = false): Promise<void> {
  const accessToken = useAuthStore.getState().accessToken;

  const response = await fetch(`${API_URL}${path}`, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    credentials: "include",
  });

  if (response.status === 401 && !skipAuthRetry) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      return downloadFile(path, fileName, true);
    }
    useAuthStore.getState().clear();
  }

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as ApiErrorResponse | null;
    if (errorBody) {
      throw new ApiError(errorBody);
    }
    throw new Error(`Error de red: ${response.status}`);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export const apiClient = {
  get: <T>(path: string, options?: RequestOptions) => request<T>(path, { ...options, method: "GET" }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: "POST", body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: "PATCH", body }),
  delete: <T>(path: string, options?: RequestOptions) => request<T>(path, { ...options, method: "DELETE" }),
  download: downloadFile,
};

export { refreshAccessToken };
