// Build-time env, read once and frozen so runtime code can't accidentally mutate.
//
// VITE_API_BASE   — backend origin, e.g. http://localhost:8080
// VITE_USE_MOCKS  — "1" to short-circuit HTTP/WS calls with in-memory seed data
//                   (lets the UI run without the backend up).

const env = import.meta.env;

export const config = Object.freeze({
  apiBase: (env.VITE_API_BASE ?? "http://localhost:8080").replace(/\/$/, ""),
  useMocks: env.VITE_USE_MOCKS === "1",
});

export type Config = typeof config;
