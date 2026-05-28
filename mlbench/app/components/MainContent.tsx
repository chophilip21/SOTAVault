"use client";

import { useSidebar } from "./LayoutContent";
import { useEffect, useState } from "react";

export default function MainContent({ children }: { children: React.ReactNode }) {
  const { isSidebarOpen } = useSidebar();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Use consistent className to avoid hydration mismatch
  // Use padding (not margin) so the content is centered within the *remaining* width when the sidebar is open.
  // On very wide screens, margin-left makes the page look off-center and can cause horizontal overflow.
  const offsetClass = isMounted && isSidebarOpen ? "md:pl-64" : "md:pl-0";

  return (
    <main
      className={`transition-all duration-300 min-h-screen pt-16 md:pt-20 ${offsetClass}`}
    >
      {children}
    </main>
  );
}
