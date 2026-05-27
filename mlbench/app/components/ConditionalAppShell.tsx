"use client";

import { useEffect } from "react";

import Header from "./Header";
import { SidebarProvider } from "./LayoutContent";
import MainContent from "./MainContent";
import { AuthProviderWrapper } from "./AuthProviderWrapper";
import ProtectedRoute from "./ProtectedRoute";
import BuyMeACoffeeWidget from "./BuyMeACoffeeWidget";
import { ToastProvider, toast } from "@/lib/toast";

function ensureFontAwesomeCdnLink() {
  if (typeof document === "undefined") return;
  const id = "font-awesome-cdn";
  if (document.getElementById(id)) return;

  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css";
  link.integrity =
    "sha512-DTOQO9RWCH3ppGqcWaEA1BIZOC6xxalwEsw9c2QQeAIftl+Vegovlnee1c9QX4TctnWMn13TZye+giMm8e2LwA==";
  link.crossOrigin = "anonymous";
  link.referrerPolicy = "no-referrer";
  document.head.appendChild(link);
}

/**
 * Next.js compiles Server Actions into unique hashed IDs per build. When a new
 * deployment rolls out while a user has an old tab open, their browser sends the
 * old hash to the new pods → "Failed to find Server Action" error. Intercept that
 * and tell the user to refresh rather than crashing silently.
 */
function useServerActionMismatchDetector() {
  useEffect(() => {
    const onUnhandled = (e: PromiseRejectionEvent) => {
      const msg: string = e?.reason?.message ?? String(e?.reason ?? "");
      if (msg.includes("Failed to find Server Action")) {
        e.preventDefault();
        toast.warn(
          "This page is out of date after a recent update.",
          { label: "Refresh", onClick: () => window.location.reload() },
        );
      }
    };
    window.addEventListener("unhandledrejection", onUnhandled);
    return () => window.removeEventListener("unhandledrejection", onUnhandled);
  }, []);
}

function AppShellInner({ children }: { children: React.ReactNode }) {
  useEffect(() => { ensureFontAwesomeCdnLink(); }, []);
  useServerActionMismatchDetector();

  return (
    <AuthProviderWrapper>
      <SidebarProvider>
        <Header />
        <MainContent>
          <ProtectedRoute>{children}</ProtectedRoute>
        </MainContent>
      </SidebarProvider>
      <BuyMeACoffeeWidget />
    </AuthProviderWrapper>
  );
}

export default function ConditionalAppShell({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <AppShellInner>{children}</AppShellInner>
    </ToastProvider>
  );
}
