"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

import Header from "./Header";
import { SidebarProvider } from "./LayoutContent";
import MainContent from "./MainContent";
import { AuthProviderWrapper } from "./AuthProviderWrapper";
import ProtectedRoute from "./ProtectedRoute";
import BuyMeACoffeeWidget from "./BuyMeACoffeeWidget";

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

function removeFontAwesomeCdnLink() {
  if (typeof document === "undefined") return;
  const el = document.getElementById("font-awesome-cdn");
  if (el?.parentNode) el.parentNode.removeChild(el);
}

export default function ConditionalAppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "";
  const isAiChat = pathname.startsWith("/ai-chat");

  useEffect(() => {
    // /ai-chat is cross-origin isolated (COOP+COEP) to enable SharedArrayBuffer and fast local inference.
    // Avoid third-party assets that can be blocked by COEP/ORB (e.g. FontAwesome CDN CSS).
    if (isAiChat) {
      removeFontAwesomeCdnLink();
      return;
    }
    ensureFontAwesomeCdnLink();
  }, [isAiChat]);

  if (isAiChat) {
    // Keep /ai-chat cross-origin-isolated friendly (no third-party CSS/scripts),
    // but keep the normal app chrome (header + sidebar) so it doesn't feel orphaned.
    return (
      <AuthProviderWrapper>
        <SidebarProvider>
          <Header />
          <MainContent>
            <ProtectedRoute>{children}</ProtectedRoute>
          </MainContent>
        </SidebarProvider>
      </AuthProviderWrapper>
    );
  }

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

