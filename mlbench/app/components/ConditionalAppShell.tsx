"use client";

import { useEffect } from "react";

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

export default function ConditionalAppShell({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    ensureFontAwesomeCdnLink();
  }, []);

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
