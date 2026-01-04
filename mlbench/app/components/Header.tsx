"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Sidebar from "./Sidebar";
import AuthModal from "./AuthModal";
import { useAuth } from "@/lib/authContext";
import { getBackendBaseUrl } from "@/lib/backendUrl";

type FuzzyHit =
  | { type: "paper"; id: string; title?: string | null }
  | { type: "dataset"; id: string; name?: string | null }
  | { type: "venue"; id: string };

type FuzzySearchResponse = {
  query: string;
  papers: FuzzyHit[];
  datasets: FuzzyHit[];
  venues: FuzzyHit[];
};

export default function Header() {
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<FuzzySearchResponse | null>(null);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const { user, userProfile, loading, logout } = useAuth();
  const router = useRouter();
  const boxRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<number | null>(null);

  const MIN_CHARS = 3;
  const DEBOUNCE_MS = 350;

  const submitSearch = () => {
    const q = query.trim();
    if (!q) return;
    setSuggestionsOpen(false);
    router.push(`/search?q=${encodeURIComponent(q)}`);
  };

  const navigateHit = (h: FuzzyHit) => {
    setSuggestionsOpen(false);
    if (h.type === "paper") router.push(`/papers/${h.id}`);
    else if (h.type === "dataset") router.push(`/datasets/${h.id}`);
    else router.push(`/conference?q=${encodeURIComponent(h.id)}`);
  };

  useEffect(() => {
    const onDocDown = (e: MouseEvent) => {
      if (!boxRef.current) return;
      if (!boxRef.current.contains(e.target as Node)) setSuggestionsOpen(false);
    };
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, []);

  useEffect(() => {
    const q = query.trim();

    // Clear quickly for short inputs.
    if (q.length < MIN_CHARS) {
      setSuggestions(null);
      setSuggestionsOpen(false);
      setSuggestionsLoading(false);
      abortRef.current?.abort();
      return;
    }

    // Debounce + cancel previous request.
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    abortRef.current?.abort();

    debounceRef.current = window.setTimeout(() => {
      const controller = new AbortController();
      abortRef.current = controller;

      const url = new URL(`${getBackendBaseUrl()}/search/typeahead`);
      url.searchParams.set("q", q);
      url.searchParams.set("limit", "3");
      url.searchParams.set("min_chars", String(MIN_CHARS));
      url.searchParams.append("types", "papers");
      url.searchParams.append("types", "datasets");
      url.searchParams.append("types", "venues");

      setSuggestionsLoading(true);
      fetch(url.toString(), { signal: controller.signal })
        .then((res) => res.ok ? res.json() : Promise.reject(new Error(`typeahead ${res.status}`)))
        .then((json: FuzzySearchResponse) => {
          setSuggestions(json);
          setSuggestionsOpen(true);
        })
        .catch((err) => {
          // Ignore aborts; keep UI quiet on transient backend issues.
          if (err?.name === "AbortError") return;
          setSuggestions(null);
          setSuggestionsOpen(false);
        })
        .finally(() => setSuggestionsLoading(false));
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [query]);

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-200">
        <div className="w-full">
          <div className="flex items-center justify-between h-20">
            {/* Logo */}
            <div className="flex items-center pl-4 sm:pl-8 lg:pl-16">
              <Link href="/" className="flex items-center">
                <Image
                  src="/logo.png"
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
              <div ref={boxRef} className="relative">
                <div className="relative rounded-full border-2 border-green-500 shadow-lg shadow-green-50">
                <input
                  type="text"
                  placeholder="Search..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onFocus={() => {
                    if ((query.trim().length >= MIN_CHARS) && suggestions) setSuggestionsOpen(true);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submitSearch();
                    if (e.key === "Escape") setSuggestionsOpen(false);
                  }}
                  className={`w-full px-3 sm:px-4 py-1.5 sm:py-2 pl-8 sm:pl-10 pr-4 text-sm border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-colors ${
                    query.trim().length > 0 ? "bg-white" : "bg-gray-100"
                  }`}
                />
                <svg
                  className="absolute left-2 sm:left-3 top-1.5 sm:top-2.5 h-4 w-4 sm:h-5 sm:w-5 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  onClick={submitSearch}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
                </div>

                {/* Typeahead dropdown */}
                {suggestionsOpen && (
                  <div className="absolute left-0 right-0 mt-2 rounded-xl border border-gray-200 bg-white shadow-xl overflow-hidden">
                    <div className="px-4 py-2 text-xs text-gray-500 flex items-center justify-between">
                      <span>Suggestions</span>
                      {suggestionsLoading ? <span>Loading…</span> : null}
                    </div>

                    <div className="max-h-80 overflow-auto">
                      {(!suggestions || ((suggestions.papers?.length || 0) + (suggestions.datasets?.length || 0) + (suggestions.venues?.length || 0) === 0)) ? (
                        <div className="px-4 py-3 text-sm text-gray-500">No matches.</div>
                      ) : (
                        <>
                          {(suggestions.papers?.length || 0) > 0 && (
                            <div className="border-t border-gray-100">
                              <div className="px-4 pt-3 pb-1 text-xs font-semibold text-gray-600">Papers</div>
                              {suggestions.papers.map((h) => (
                                <button
                                  key={`p-${h.id}`}
                                  className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50"
                                  onClick={() => navigateHit(h)}
                                >
                                  {(h as any).title || h.id}
                                </button>
                              ))}
                            </div>
                          )}

                          {(suggestions.datasets?.length || 0) > 0 && (
                            <div className="border-t border-gray-100">
                              <div className="px-4 pt-3 pb-1 text-xs font-semibold text-gray-600">Datasets</div>
                              {suggestions.datasets.map((h) => (
                                <button
                                  key={`d-${h.id}`}
                                  className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50"
                                  onClick={() => navigateHit(h)}
                                >
                                  {(h as any).name || h.id}
                                </button>
                              ))}
                            </div>
                          )}

                          {(suggestions.venues?.length || 0) > 0 && (
                            <div className="border-t border-gray-100">
                              <div className="px-4 pt-3 pb-1 text-xs font-semibold text-gray-600">Conferences</div>
                              {suggestions.venues.map((h) => (
                                <button
                                  key={`v-${h.id}`}
                                  className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50"
                                  onClick={() => navigateHit(h)}
                                >
                                  {h.id}
                                </button>
                              ))}
                            </div>
                          )}
                        </>
                      )}

                      <div className="border-t border-gray-200">
                        <button
                          className="w-full text-left px-4 py-3 text-sm font-medium text-green-700 hover:bg-green-50"
                          onClick={submitSearch}
                        >
                          Search for “{query.trim()}”
                        </button>
                      </div>
                    </div>
                  </div>
                )}
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
