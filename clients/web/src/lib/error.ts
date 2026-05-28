// Centralised error-to-string extraction so screens stop reaching for
// `(err as Error).message` (which crashes on null / non-Error throws and
// loses the rich `HttpError` status detail).

import { HttpError } from "./http";

/** Human-readable summary of any thrown value. Safe on null/undefined. */
export function errorMessage(err: unknown): string {
  if (err instanceof HttpError) {
    // HttpError's own toString includes status + url; trim to the meaningful
    // bit and let `errorDetail` carry the URL separately.
    return httpHeadline(err.status);
  }
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err.length > 0) return err;
  return "Something went wrong";
}

/** Optional second line — status code + path for HttpErrors, undefined otherwise. */
export function errorDetail(err: unknown): string | undefined {
  if (err instanceof HttpError) {
    try {
      const path = new URL(err.url).pathname;
      return `${err.status} · ${path}`;
    } catch {
      return `${err.status}`;
    }
  }
  return undefined;
}

function httpHeadline(status: number): string {
  if (status === 401) return "Session expired — sign in again";
  if (status === 403) return "Not authorized";
  if (status === 404) return "Not found";
  if (status === 429) return "Rate-limited — try again shortly";
  if (status === 503) return "Service unavailable";
  if (status >= 500) return "Backend error";
  return "Request failed";
}
