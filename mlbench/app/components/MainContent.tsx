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
  const marginClass = isMounted && isSidebarOpen ? "md:ml-64" : "md:ml-0";

  return (
    <main
      className={`transition-all duration-300 min-h-screen pt-20 ${marginClass}`}
    >
      {children}
    </main>
  );
}
