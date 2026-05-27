import { authStore } from "./auth-store";
import { config } from "./config";

/** Thrown for any non-2xx response. `status` lets call sites special-case 401/404. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly statusText: string,
    readonly body: unknown,
    readonly url: string,
  ) {
    super(`${status} ${statusText} — ${url}`);
    this.name = "HttpError";
  }
}

type RequestOptions = {
  method?: "GET" | "POST" | "DELETE" | "PUT" | "PATCH";
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  signal?: AbortSignal;
  /** Set to true for `/auth/*` endpoints which must run unauthenticated. */
  anonymous?: boolean;
};

function buildUrl(path: string, query?: RequestOptions["query"]): string {
  const url = new URL(path.startsWith("http") ? path : `${config.apiBase}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const url = buildUrl(path, opts.query);
  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  if (opts.body !== undefined) headers["Content-Type"] = "application/json";

  if (!opts.anonymous) {
    const token = authStore.getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  const init: RequestInit = {
    method: opts.method ?? "GET",
    headers,
  };
  if (opts.body !== undefined) init.body = JSON.stringify(opts.body);
  if (opts.signal) init.signal = opts.signal;

  const response = await fetch(url, init);

  // 401 mid-session almost always means the JWT expired — clear it so the next
  // route guard sends the user back through SIWS instead of looping on 401s.
  if (response.status === 401 && !opts.anonymous) {
    authStore.setToken(null);
  }

  const text = await response.text();
  const parsed: unknown = text.length > 0 ? safeParse(text) : null;

  if (!response.ok) {
    throw new HttpError(response.status, response.statusText, parsed, url);
  }

  return parsed as T;
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
