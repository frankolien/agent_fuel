// Single source of truth for the SIWS JWT. Subscribers are notified on change
// so the React tree re-renders when the user signs in or out. Reads localStorage
// once at startup; writes go straight through. Slice 4.W.5 builds the SIWS UI
// on top of this; for now it powers the `Authorization` header in http.ts.

const STORAGE_KEY = "af.jwt";

type Listener = (token: string | null) => void;

class AuthStore {
  private token: string | null = null;
  private listeners = new Set<Listener>();

  constructor() {
    try {
      this.token = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      // localStorage can be unavailable (private mode, SSR) — start unauth.
    }
  }

  getToken(): string | null {
    return this.token;
  }

  setToken(next: string | null): void {
    this.token = next;
    try {
      if (next === null) {
        window.localStorage.removeItem(STORAGE_KEY);
      } else {
        window.localStorage.setItem(STORAGE_KEY, next);
      }
    } catch {
      // ignore quota / disabled storage — in-memory token still works for the session
    }
    for (const listener of this.listeners) listener(next);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

export const authStore = new AuthStore();
