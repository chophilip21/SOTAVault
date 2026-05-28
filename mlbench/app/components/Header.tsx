"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Sidebar from "./Sidebar";
import AuthModal from "./AuthModal";
import UserAvatar from "./UserAvatar";
import { useAuth } from "@/lib/authContext";
import { getBackendBaseUrl } from "@/lib/backendUrl";
import { cleanPaperTitle } from "@/lib/paperTitle";
import { useSidebar } from "./LayoutContent";

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

function stripWrappingQuotes(s: string): string {
  const t = s.trim();
  if (t.length >= 2) {
    if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
      return t.slice(1, -1).trim();
    }
  }
  return t;
}

export default function Header() {
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<FuzzySearchResponse | null>(null);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const { user, userProfile, loading, logout, pendingGoogleSignup } = useAuth();
  const { isSidebarOpen, setIsSidebarOpen } = useSidebar();
  const router = useRouter();
  const boxRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<number | null>(null);
  const [searchPlaceholder, setSearchPlaceholder] = useState("Search...");

  const MIN_CHARS = 3;
  const DEBOUNCE_MS = 350;

  useEffect(() => {
    if (pendingGoogleSignup) {
      setIsAuthModalOpen(true);
    }
  }, [pendingGoogleSignup]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const updatePlaceholder = () => {
      setSearchPlaceholder(mq.matches ? "type to search here" : "Search...");
    };
    updatePlaceholder();
    mq.addEventListener("change", updatePlaceholder);
    return () => mq.removeEventListener("change", updatePlaceholder);
  }, []);

  const resetMobileZoom = () => {
    const viewportMeta = document.querySelector('meta[name="viewport"]');
    if (viewportMeta) {
      const originalContent = viewportMeta.getAttribute("content");
      viewportMeta.setAttribute(
        "content",
        "width=device-width, initial-scale=1, maximum-scale=1"
      );
      setTimeout(() => {
        if (originalContent) {
          viewportMeta.setAttribute("content", originalContent);
        } else {
          viewportMeta.setAttribute("content", "width=device-width, initial-scale=1");
        }
      }, 300);
    }
  };

  const submitSearch = () => {
    if (!user) {
      setIsAuthModalOpen(true);
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      return;
    }
    const q = query.trim();
    if (!q) return;
    setSuggestionsOpen(false);
    router.push(`/search?q=${encodeURIComponent(q)}`);
  };

  const navigateHit = (e: React.PointerEvent, h: FuzzyHit) => {
    // preventDefault keeps focus on the input, preventing the onFocus handler
    // from re-opening the dropdown mid-navigation. Works for mouse AND touch.
    e.preventDefault();
    if (!user) {
      setIsAuthModalOpen(true);
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      return;
    }
    setSuggestionsOpen(false);
    setQuery("");
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
      <header className="fixed top-0 left-0 right-0 z-50 bg-gray-50 border-b border-gray-200">
        <div className="w-full">
          <div className="flex items-center justify-between h-16 md:h-20">
            {/* Mobile: menu toggle (Reddit-style). Desktop: wordmark logo. */}
            <div className="flex items-center pl-3 sm:pl-4 md:pl-8 lg:pl-16 shrink-0">
              <button
                type="button"
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                className="md:hidden p-2 -ml-1 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors"
                aria-label={isSidebarOpen ? "Close navigation menu" : "Open navigation menu"}
                aria-expanded={isSidebarOpen}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <Link href="/" className="hidden md:flex items-center shrink-0">
                <Image
                  src="/sotavault.svg"
                  alt="SotaVault logo"
                  width={1209}
                  height={364}
                  unoptimized
                  priority
                  className="object-contain max-h-10 w-auto h-auto"
                />
              </Link>
            </div>

            {/* Search Box — full width on mobile (avatar hidden to free space) */}
            <div className="flex-1 min-w-0 max-md:max-w-none max-w-xl mx-1 max-md:mx-1.5 md:mx-4">
              <div ref={boxRef} className="relative">
                <div className="relative rounded-full border-2 border-green-500 shadow-lg shadow-green-50">
                  {/* Mobile: compact logo at the start of the search bar */}
                  <div
                    className="md:hidden absolute left-2 top-1/2 -translate-y-1/2 flex items-center pointer-events-none z-10"
                    aria-hidden="true"
                  >
                    <Image
                      src="/mobile-logo.png"
                      alt=""
                      width={706}
                      height={731}
                      unoptimized
                      sizes="28px"
                      className="logo-mobile-crisp object-contain h-7 w-7"
                    />
                  </div>
                  <input
                    type="text"
                    placeholder={searchPlaceholder}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onFocus={() => {
                      if ((query.trim().length >= MIN_CHARS) && suggestions) setSuggestionsOpen(true);
                    }}
                    onBlur={resetMobileZoom}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") submitSearch();
                      if (e.key === "Escape") {
                        setSuggestionsOpen(false);
                        e.currentTarget.blur();
                      }
                    }}
                    className={`w-full px-3 sm:px-4 py-1.5 sm:py-2 pr-4 text-sm border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-colors max-md:pl-10 max-md:pr-10 max-md:text-center max-md:placeholder:text-center md:pl-10 ${query.trim().length > 0 ? "bg-white" : "bg-gray-100"
                      }`}
                  />
                  <button
                    type="button"
                    onPointerDown={(e) => { e.preventDefault(); submitSearch(); }}
                    className="hidden md:block absolute top-1/2 -translate-y-1/2 left-3 p-0.5 rounded-full text-gray-400 hover:text-gray-600"
                    aria-label="Search"
                  >
                    <svg
                      className="h-4 w-4 sm:h-5 sm:w-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                      />
                    </svg>
                  </button>
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
                                  onPointerDown={(e) => navigateHit(e, h)}
                                >
                                  {cleanPaperTitle((h as any).title) || h.id}
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
                                  onPointerDown={(e) => navigateHit(e, h)}
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
                                  onPointerDown={(e) => navigateHit(e, h)}
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
                          onPointerDown={(e) => { e.preventDefault(); submitSearch(); }}
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
            <div className="flex shrink-0 items-center gap-1.5 max-md:gap-1 sm:gap-3 pr-2 max-md:pr-2.5 sm:pr-6 lg:pr-8">
              {loading ? (
                <div className="max-md:px-1 md:px-4 py-2 text-sm text-gray-500">Loading...</div>
              ) : user && userProfile ? (
                <>
                  {/* Profile link + avatar — desktop only; mobile uses header space for search */}
                  <Link
                    href="/profile"
                    className="hidden md:flex items-center gap-2 hover:opacity-80 transition-opacity cursor-pointer"
                  >
                    <div className="relative w-8 h-8 flex items-center justify-center">
                      <UserAvatar
                        uid={userProfile.uid}
                        photoUrl={userProfile.photo_url}
                        size={32}
                      />
                    </div>
                    <span className="text-sm font-medium text-gray-700">
                      {userProfile.display_name || userProfile.email?.split("@")[0] || "User"}
                    </span>
                  </Link>
                  <button
                    onClick={async () => {
                      try {
                        await logout();
                      } catch (error) {
                        console.error("Logout failed:", error);
                      }
                    }}
                    className="max-md:px-3 max-md:py-1.5 md:px-4 md:py-2 text-sm font-semibold text-white bg-red-500 rounded-full hover:bg-red-600 transition-colors"
                  >
                    Logout
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setIsAuthModalOpen(true)}
                  className="max-md:px-3 max-md:py-1.5 md:px-4 md:py-2 text-sm font-semibold text-white bg-[#007a3a] rounded-full hover:bg-[#006631] transition-colors max-md:shadow-none md:animate-pulse-subtle md:shadow-sm md:shadow-[rgba(0,122,58,0.15)] md:hover:bg-[#006631] md:hover:shadow-md md:hover:shadow-[rgba(0,122,58,0.25)] md:hover:scale-105 md:transition-all"
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
