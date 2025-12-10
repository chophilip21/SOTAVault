"use client";

import { useSidebar } from "./LayoutContent";

export default function MainContent({ children }: { children: React.ReactNode }) {
  const { isSidebarOpen } = useSidebar();

  return (
    <main
      className={`transition-all duration-300 ${
        isSidebarOpen ? "md:ml-64" : "md:ml-0"
      }`}
    >
      {children}
    </main>
  );
}
