"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useSidebar } from "./LayoutContent";
import { useAuth } from "@/lib/authContext";

const navItems = [
  { 
    name: "Home", 
    href: "/",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    )
  },
  { 
    name: "Papers", 
    href: "/papers",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    )
  },
  { 
    name: "Benchmark", 
    href: "/benchmark",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    )
  },
  { 
    name: "Models", 
    href: "/models",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
      </svg>
    )
  },
  { 
    name: "Conference", 
    href: "/conference",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    )
  },
  { 
    name: "Bookmarks", 
    href: "/bookmarks",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
      </svg>
    )
  },
];

// Essential tabs that require login
const protectedRoutes = ['/papers', '/benchmark', '/models', '/conference', '/bookmarks', '/datasets'];

interface SidebarProps {
  onLoginRequired: () => void;
}

export default function Sidebar({ onLoginRequired }: SidebarProps) {
  const pathname = usePathname();
  const { isSidebarOpen, setIsSidebarOpen } = useSidebar();
  const { user } = useAuth();
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth < 768 : false
  );
  
  const isOpen = isSidebarOpen;
  const onClose = () => setIsSidebarOpen(false);

  // Track mobile/desktop to position the toggle button safely
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Prevent body scroll when sidebar is open on mobile
  useEffect(() => {
    if (isOpen && typeof window !== "undefined") {
      // Check if mobile
      if (window.innerWidth < 768) {
        const scrollY = window.scrollY;
        document.body.style.overflow = "hidden";
        document.body.style.position = "fixed";
        document.body.style.top = `-${scrollY}px`;
        document.body.style.width = "100%";
        document.body.style.left = "0";
        document.body.style.right = "0";
        document.documentElement.style.overflowX = "hidden";
        document.documentElement.style.width = "100%";
      }
    } else {
      const scrollY = document.body.style.top;
      document.body.style.overflow = "";
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.width = "";
      document.body.style.left = "";
      document.body.style.right = "";
      document.documentElement.style.overflowX = "";
      document.documentElement.style.width = "";
      if (scrollY) {
        window.scrollTo(0, parseInt(scrollY || "0") * -1);
      }
    }

    return () => {
      const scrollY = document.body.style.top;
      document.body.style.overflow = "";
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.width = "";
      document.body.style.left = "";
      document.body.style.right = "";
      document.documentElement.style.overflowX = "";
      document.documentElement.style.width = "";
      if (scrollY) {
        window.scrollTo(0, parseInt(scrollY || "0") * -1);
      }
    };
  }, [isOpen]);

  return (
    <>
      {/* Overlay - Only on mobile, behind sidebar but above content */}
      {isOpen && (
        <div
          className="fixed inset-x-0 top-20 bottom-0 bg-black bg-opacity-50 z-[35] transition-opacity duration-300 md:hidden"
          onClick={onClose}
        />
      )}

      {/* Toggle Button - Always visible at the edge, positioned based on sidebar state */}
      <button
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        className={`fixed z-[45] border-2 rounded-full p-2.5 transition-all duration-300 ease-in-out top-20 md:top-1/2 md:-translate-y-1/2 flex ${
          isOpen
            ? 'bg-white border-gray-300 shadow-md hover:bg-gray-50'
            : 'bg-green-500 border-green-600 shadow-lg shadow-green-500/50 hover:bg-green-600 hover:shadow-xl hover:shadow-green-600/60 hover:scale-110'
        }`}
        style={{
          left: isOpen
            ? (isMobile ? '0.75rem' : 'calc(16rem - 0.75rem)')
            : '0.75rem'
        }}
        aria-label="Toggle navigation menu"
      >
        <svg
          className={`w-6 h-6 transition-transform duration-300 ${isOpen ? 'text-gray-600' : 'text-white'}`}
          style={{
            transform: isOpen ? 'none' : 'rotate(180deg)'
          }}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2.5}
            d="M15 19l-7-7 7-7"
          />
        </svg>
      </button>

      {/* Sidebar */}
      <aside
        className="fixed left-0 top-20 h-[calc(100vh-5rem)] w-screen md:w-64 bg-white border-r border-gray-200 z-[40] transform transition-transform duration-300 ease-in-out overflow-y-auto"
        style={{ transform: isOpen ? 'translateX(0)' : 'translateX(-100%)' }}
      >
        <div className="flex flex-col h-full">
          {/* Sidebar Header - Only on mobile */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200 md:hidden">
            <h2 className="text-lg font-semibold text-gray-900">Navigation</h2>
            <button
              onClick={onClose}
              className="p-2 rounded-md hover:bg-gray-100 transition-colors"
              aria-label="Close sidebar"
            >
              <svg
                className="w-6 h-6 text-gray-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* Navigation Items */}
          <nav className="flex-1 p-4 flex flex-col">
            <ul className="space-y-2 flex-1">
              {navItems.map((item) => {
                const isActive = pathname === item.href;
                const requiresAuth = protectedRoutes.includes(item.href);
                
                return (
                  <li key={item.name}>
                    {requiresAuth && !user ? (
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          onLoginRequired();
                          // Close sidebar on mobile
                          if (window.innerWidth < 768) {
                            onClose();
                          }
                        }}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                          isActive
                            ? "bg-green-50 text-green-600 border-l-4 border-green-500"
                            : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                        }`}
                      >
                        <span className={`flex-shrink-0 ${isActive ? "text-green-600" : "text-gray-600"}`}>
                          {item.icon}
                        </span>
                        <span>{item.name}</span>
                      </button>
                    ) : (
                      <Link
                        href={item.href}
                        onClick={() => {
                          // Only close on mobile
                          if (window.innerWidth < 768) {
                            onClose();
                          }
                        }}
                        className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                          isActive
                            ? "bg-green-50 text-green-600 border-l-4 border-green-500"
                            : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                        }`}
                      >
                        <span className={`flex-shrink-0 ${isActive ? "text-green-600" : "text-gray-600"}`}>
                          {item.icon}
                        </span>
                        <span>{item.name}</span>
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>

            {/* Divider */}
            <div className="border-t border-gray-200 my-4"></div>

            {/* Second-tier Navigation */}
            <ul className="space-y-1">
              <li>
                <Link
                  href="/terms"
                  onClick={() => {
                    if (window.innerWidth < 768) {
                      onClose();
                    }
                  }}
                  className={`flex items-center gap-3 px-4 py-2 rounded-lg text-xs font-medium transition-colors ${
                    pathname === "/terms"
                      ? "bg-gray-50 text-gray-900"
                      : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  }`}
                >
                  <span>Terms and Conditions</span>
                </Link>
              </li>
              <li>
                <Link
                  href="/privacy"
                  onClick={() => {
                    if (window.innerWidth < 768) {
                      onClose();
                    }
                  }}
                  className={`flex items-center gap-3 px-4 py-2 rounded-lg text-xs font-medium transition-colors ${
                    pathname === "/privacy"
                      ? "bg-gray-50 text-gray-900"
                      : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  }`}
                >
                  <span>Privacy Policy</span>
                </Link>
              </li>
              <li>
                <a
                  href="https://github.com/chophilip21"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => {
                    if (window.innerWidth < 768) {
                      onClose();
                    }
                  }}
                  className="flex items-center gap-3 px-4 py-2 rounded-lg text-xs font-medium transition-colors text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                >
                  <span>Github</span>
                </a>
              </li>
            </ul>
          </nav>
        </div>
      </aside>
    </>
  );
}
