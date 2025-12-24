"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import Sidebar from "./Sidebar";
import AuthModal from "./AuthModal";
import { useAuth } from "@/lib/authContext";

export default function Header() {
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const { user, userProfile, loading, logout } = useAuth();

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-200">
        <div className="w-full">
          <div className="flex items-center justify-between h-20">
            {/* Logo */}
            <div className="flex items-center pl-4 sm:pl-8 lg:pl-16">
              <Link href="/" className="flex items-center">
                <Image
                  src="/mltree.png"
                  alt="MLBench Logo"
                  width={120}
                  height={120}
                  className="object-contain h-[60px] w-[60px] sm:h-[80px] sm:w-[80px] md:h-[100px] md:w-[100px] lg:h-[120px] lg:w-[120px]"
                  priority
                />
              </Link>
            </div>

            {/* Search Box */}
            <div className="flex-1 max-w-xl mx-2 sm:mx-4">
              <div className="relative rounded-full border-2 border-green-500 shadow-lg shadow-green-50">
                <input
                  type="text"
                  placeholder="Search..."
                  className="w-full px-3 sm:px-4 py-1.5 sm:py-2 pl-8 sm:pl-10 pr-4 text-sm bg-gray-100 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
                <svg
                  className="absolute left-2 sm:left-3 top-1.5 sm:top-2.5 h-4 w-4 sm:h-5 sm:w-5 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              </div>
            </div>

            {/* User Info / Login Button */}
            <div className="flex items-center gap-2 sm:gap-3 pr-4 sm:pr-6 lg:pr-8">
              {loading ? (
                <div className="px-4 py-2 text-sm text-gray-500">Loading...</div>
              ) : user && userProfile ? (
                <>
                  {/* User Info */}
                  <Link href="/profile" className="flex items-center gap-2 hover:opacity-80 transition-opacity cursor-pointer">
                    <div className="relative w-8 h-8 rounded-full overflow-hidden bg-gray-200 flex items-center justify-center">
                      {userProfile.photo_url ? (
                        <Image
                          src={userProfile.photo_url}
                          alt="User"
                          width={32}
                          height={32}
                          className="object-cover"
                        />
                      ) : (
                        <Image
                          src="/user.svg"
                          alt="User"
                          width={20}
                          height={20}
                          className="object-contain"
                        />
                      )}
                    </div>
                    <span className="text-sm font-medium text-gray-700 hidden sm:inline">
                      {userProfile.display_name || userProfile.email?.split("@")[0] || "User"}
                    </span>
                  </Link>
                  {/* Logout Button */}
                  <button
                    onClick={async () => {
                      try {
                        await logout();
                      } catch (error) {
                        console.error("Logout failed:", error);
                        // You could show an error toast here if needed
                      }
                    }}
                    className="px-4 py-2 text-sm font-semibold text-white bg-red-500 rounded-full hover:bg-red-600 transition-colors"
                  >
                    Logout
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setIsAuthModalOpen(true)}
                  className="px-4 py-2 text-sm font-semibold text-white bg-emerald-600 rounded-full hover:bg-emerald-700 transition-all animate-pulse-subtle shadow-sm shadow-emerald-500/10 hover:shadow-md hover:shadow-emerald-600/14 hover:scale-105"
                >
                  Login
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Sidebar */}
      <Sidebar onLoginRequired={() => setIsAuthModalOpen(true)} />

      {/* Auth Modal */}
      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
    </>
  );
}
