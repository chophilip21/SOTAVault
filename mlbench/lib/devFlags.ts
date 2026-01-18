export function isAuthBypassed(): boolean {
  // Only allow this in dev/non-production builds.
  if (process.env.NODE_ENV === "production") return false;
  return false;
}


