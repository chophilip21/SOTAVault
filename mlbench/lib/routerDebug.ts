"use client";

/**
 * Opt-in routing debug utilities.
 *
 * Enable via either:
 * - env: NEXT_PUBLIC_ROUTER_DEBUG=1
 * - browser: localStorage.setItem("mlbench.routerDebug","1")
 */

const LS_KEY = "mlbench.routerDebug";

export function isRouterDebugEnabled(): boolean {
  if (process.env.NEXT_PUBLIC_ROUTER_DEBUG === "1") return true;
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(LS_KEY) === "1";
  } catch {
    return false;
  }
}

export function routerDebugGroup(title: string, fn: () => void) {
  if (!isRouterDebugEnabled()) return;
  try {
    // eslint-disable-next-line no-console
    console.groupCollapsed(title);
    fn();
  } finally {
    // eslint-disable-next-line no-console
    console.groupEnd();
  }
}

export function routerDebugLog(...args: any[]) {
  if (!isRouterDebugEnabled()) return;
  // eslint-disable-next-line no-console
  console.log(...args);
}


