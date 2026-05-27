/** Session storage key for resuming Google OAuth after signInWithRedirect. */
export const GOOGLE_AUTH_PENDING_KEY = "mlbench_google_auth_pending";

export type GoogleAuthIntent = "login" | "signup";

export interface GoogleAuthPending {
  intent: GoogleAuthIntent;
  startedAt: number;
}

export function setGoogleAuthPending(intent: GoogleAuthIntent): void {
  if (typeof window === "undefined") return;
  const payload: GoogleAuthPending = { intent, startedAt: Date.now() };
  sessionStorage.setItem(GOOGLE_AUTH_PENDING_KEY, JSON.stringify(payload));
}

export function consumeGoogleAuthPending(): GoogleAuthPending | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(GOOGLE_AUTH_PENDING_KEY);
    sessionStorage.removeItem(GOOGLE_AUTH_PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GoogleAuthPending;
    if (parsed?.intent !== "login" && parsed?.intent !== "signup") return null;
    return parsed;
  } catch {
    sessionStorage.removeItem(GOOGLE_AUTH_PENDING_KEY);
    return null;
  }
}
