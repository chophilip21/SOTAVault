/** Fired when a logged-out user tries a login-only action (e.g. bookmark). */
export const LOGIN_REQUIRED_EVENT = "mlbench:login-required";

export function requestLogin(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(LOGIN_REQUIRED_EVENT));
  }
}

/** Detail pages and list indexes visitors may open without signing in. */
const PUBLIC_DETAIL_PATTERNS = [
  /^\/papers$/,
  /^\/papers\/[^/]+$/,
  /^\/benchmark$/,
  /^\/conference$/,
  /^\/conference\/[^/]+$/,
  /^\/datasets\/[^/]+$/,
  /^\/dataset-series\/[^/]+$/,
  /^\/ai-search$/,
];

/** Routes (and their sub-paths) that require authentication, except public detail pages above. */
const PROTECTED_PREFIXES = [
  "/bookmarks",
];

export function requiresAuth(path: string): boolean {
  const pathname = path.split("?")[0].split("#")[0];

  if (PUBLIC_DETAIL_PATTERNS.some((re) => re.test(pathname))) {
    return false;
  }

  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}
