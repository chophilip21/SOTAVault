"use client";

import { Playfair_Display } from "next/font/google";

const playfairDisplay = Playfair_Display({ subsets: ["latin"], weight: ["700"] });

export default function AIChatPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="bg-gray-50 rounded-2xl p-6 shadow-sm border border-gray-100">
        <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
          <div className="mb-6">
            <svg
              className="w-24 h-24 mx-auto text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
          </div>
          <h1 className={`text-5xl font-bold text-gray-900 mb-4 ${playfairDisplay.className}`}>
            AI Chat
          </h1>
          <p className="text-gray-600 text-lg mb-2">
            Coming soon...
          </p>
          <p className="text-gray-500 text-sm">
            This feature is currently in development.
          </p>
        </div>
      </div>
    </div>
  );
}

