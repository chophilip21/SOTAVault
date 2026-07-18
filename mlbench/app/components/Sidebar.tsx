"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useSidebar } from "./LayoutContent";
import { useAuth } from "@/lib/authContext";
import { requiresAuth } from "@/lib/routeAccess";

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
  {
    name: "AI Search",
    href: "/ai-search",
    beta: true,
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z"
        />
      </svg>
    ),
  },
//   {
//     name: "Docs",
//     href: "/docs",
//     icon: (
//       <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
//         <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
//       </svg>
//     )
//   },
];

interface SidebarProps {
  onLoginRequired: () => void;
}

export default function Sidebar({ onLoginRequired }: SidebarProps) {
  const pathname = usePathname();
  const { isSidebarOpen, setIsSidebarOpen } = useSidebar();
  const { user } = useAuth();

  const isOpen = isSidebarOpen;
  const onClose = () => setIsSidebarOpen(false);

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
          className="fixed inset-x-0 top-16 md:top-20 bottom-0 bg-black bg-opacity-50 z-[35] transition-opacity duration-300 md:hidden"
          onClick={onClose}
        />
      )}

      {/* Desktop-only edge toggle; mobile uses the header hamburger */}
      <button
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        className={`hidden md:flex fixed z-[45] border-2 rounded-full p-2.5 transition-all duration-300 ease-in-out top-1/2 -translate-y-1/2 ${isOpen
          ? 'bg-white border-gray-300 shadow-md hover:bg-gray-50'
          : 'bg-green-500 border-green-600 shadow-lg shadow-green-500/50 hover:bg-green-600 hover:shadow-xl hover:shadow-green-600/60 hover:scale-110'
          }`}
        style={{
          left: isOpen ? 'calc(16rem - 0.75rem)' : '0.75rem',
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
        className="fixed left-0 top-16 md:top-20 h-[calc(100vh-4rem)] md:h-[calc(100vh-5rem)] w-screen md:w-64 bg-gray-50 border-r border-gray-200 z-[40] transform transition-transform duration-300 ease-in-out flex flex-col"
        style={{ transform: isOpen ? 'translateX(0)' : 'translateX(-100%)' }}
      >
        <div className="flex flex-col h-full min-h-0">
          {/* Sidebar Header - Only on mobile */}
          <div className="relative flex-shrink-0 flex items-center justify-center p-4 border-b border-gray-200 md:hidden">
            <h2 className="text-lg font-semibold text-gray-900 text-center w-full">Navigation</h2>
            <button
              onClick={onClose}
              className="absolute right-4 p-2 rounded-md hover:bg-gray-100 transition-colors"
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

          {/* Navigation Items - scrollable so footer stays visible */}
          <nav className="flex-1 min-h-0 p-4 flex flex-col overflow-hidden">
            <ul className="space-y-2 min-h-0 overflow-y-auto flex-1">
              {navItems.map((item) => {
                const isActive = pathname === item.href;
                const routeRequiresAuth = requiresAuth(item.href);

                return (
                  <li key={item.name}>
                    {routeRequiresAuth && !user ? (
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          onLoginRequired();
                          // Close sidebar on mobile
                          if (window.innerWidth < 768) {
                            onClose();
                          }
                        }}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors max-md:justify-center ${isActive
                          ? "bg-green-50 text-green-600 border-l-4 border-green-500 max-md:border-l-0"
                          : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                          }`}
                      >
                        <span className={`flex-shrink-0 ${isActive ? "text-green-600" : "text-gray-600"}`}>
                          {item.icon}
                        </span>
                        <span className="flex items-center justify-center gap-2 max-md:justify-center">
                          {item.name}
                          {item.beta && (
                            <span className="text-[10px] font-semibold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">
                              BETA
                            </span>
                          )}
                        </span>
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
                        className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors max-md:justify-center ${isActive
                          ? "bg-green-50 text-green-600 border-l-4 border-green-500 max-md:border-l-0"
                          : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                          }`}
                      >
                        <span className={`flex-shrink-0 ${isActive ? "text-green-600" : "text-gray-600"}`}>
                          {item.icon}
                        </span>
                        <span className="flex items-center justify-center gap-2 max-md:justify-center">
                          {item.name}
                          {item.beta && (
                            <span className="text-[10px] font-semibold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">
                              BETA
                            </span>
                          )}
                        </span>
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>

            {/* Divider */}
            <div className="border-t border-gray-200 my-4 flex-shrink-0 max-md:mx-auto max-md:w-4/5"></div>

            {/* Second-tier Navigation - always visible at bottom */}
            <ul className="space-y-1 flex-shrink-0 pb-6 max-md:text-center">
              <li>
                <Link
                  href="/terms"
                  onClick={() => {
                    if (window.innerWidth < 768) {
                      onClose();
                    }
                  }}
                  className={`flex items-center gap-3 px-4 py-2 rounded-lg text-xs font-medium transition-colors max-md:justify-center ${pathname === "/terms"
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
                  className={`flex items-center gap-3 px-4 py-2 rounded-lg text-xs font-medium transition-colors max-md:justify-center ${pathname === "/privacy"
                    ? "bg-gray-50 text-gray-900"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                    }`}
                >
                  <span>Privacy Policy</span>
                </Link>
              </li>
              <li>
                <a
                  href="https://github.com/chophilip21/MLBenchArchive-app"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => {
                    if (window.innerWidth < 768) {
                      onClose();
                    }
                  }}
                  className="flex items-center gap-3 px-4 py-2 rounded-lg text-xs font-medium transition-colors text-gray-600 hover:bg-gray-50 hover:text-gray-900 max-md:justify-center"
                >
                  <span>Github</span>
                </a>
              </li>
              <li>
                <Link
                  href="/acknowledgement"
                  onClick={() => {
                    if (window.innerWidth < 768) {
                      onClose();
                    }
                  }}
                  className={`flex items-center gap-3 px-4 py-2 rounded-lg text-xs font-medium transition-colors max-md:justify-center ${pathname === "/acknowledgement"
                    ? "bg-gray-50 text-gray-900"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                    }`}
                >
                  <span>Acknowledgements</span>
                </Link>
              </li>
            </ul>
          </nav>
        </div>
      </aside>
    </>
  );
}
