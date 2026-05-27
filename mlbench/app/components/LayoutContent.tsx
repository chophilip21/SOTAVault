"use client";

import { useState, createContext, useContext, useEffect } from "react";

interface SidebarContextType {
  isSidebarOpen: boolean;
  setIsSidebarOpen: (open: boolean) => void;
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  // Start with false to avoid hydration mismatch, then set correct state after mount
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  // Set initial state after hydration to avoid mismatch
  useEffect(() => {
    setIsMounted(true);
    // Set initial state based on screen size
    if (window.innerWidth >= 768) {
      setIsSidebarOpen(true);
    }
  }, []);

  useEffect(() => {
    if (!isMounted) return;

    const handleResize = () => {
      // On desktop, keep current state; on mobile, close if open
      if (window.innerWidth < 768 && isSidebarOpen) {
        setIsSidebarOpen(false);
      } else if (window.innerWidth >= 768 && !isSidebarOpen) {
        // Optionally auto-open on desktop resize, but let's keep user preference
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [isSidebarOpen, isMounted]);

  return (
    <SidebarContext.Provider value={{ isSidebarOpen, setIsSidebarOpen }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const context = useContext(SidebarContext);
  if (context === undefined) {
    throw new Error("useSidebar must be used within a SidebarProvider");
  }
  return context;
}
