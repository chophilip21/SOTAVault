"use client";

import Image from "next/image";
import Link from "next/link";
import { Playfair_Display } from "next/font/google";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { config } from "@/lib/config";
import { getBackendBaseUrl } from "@/lib/backendUrl";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { useBookmarks } from "@/hooks/useBookmarks";

const playfairDisplay = Playfair_Display({ subsets: ["latin"], weight: ["700"] });

interface VenueTimeline {
  abstract_deadline?: string | null;
  pdf_deadline?: string | null;
}

// Conference series - shared metadata across all yearly editions
interface ConferenceSeries {
  id: string;
  name: string;
  full_name?: string | null;
  type?: string | null;
  description?: string | null;
  sub?: string | null;
  rank?: Record<string, string> | null;
  dblp?: string | null;
  tags?: string[];
}

// Venue - yearly conference edition
interface Venue {
  id: string;
  series_id: string;
  year?: number | null;
  website?: string | null;
  timezone?: string | null;
  place?: string | null;
  conference_start_date?: string | null;
  conference_end_date?: string | null;
  timeline?: VenueTimeline[];
  paper_count?: number;
  created_at?: string;
  updated_at?: string;
}

// Combined venue with series data for display
interface VenueWithSeries extends Venue {
  series?: ConferenceSeries;
}

interface VenuesResponse {
  items: Venue[];
  limit: number;
  next_cursor?: string | null;
  has_more: boolean;
}

interface SeriesResponse {
  items: ConferenceSeries[];
}

const CATEGORY_TAGS = [
  "Machine Learning",
  "Computer Vision",
  "Natural Language Processing",
  "Robotics",
  "Mathematics",
  "Reinforcement Learning",
  "Signal Processing",
  "Human Computer Interaction",
  "Data Mining",
] as const;

const toISODate = (d: Date) => {
  // YYYY-MM-DD
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const getVenueSortName = (venue: VenueWithSeries) => {
  // Use series name for sorting
  return (venue.series?.name || venue.series_id || "").trim();
};

const hashString = (s: string) => {
  // Simple, stable hash for picking a color/gradient.
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
};

const GRADIENTS = [
  "from-green-50 to-green-100 text-green-800",
  "from-blue-50 to-blue-100 text-blue-800",
  "from-purple-50 to-purple-100 text-purple-800",
  "from-amber-50 to-amber-100 text-amber-800",
  "from-rose-50 to-rose-100 text-rose-800",
  "from-teal-50 to-teal-100 text-teal-800",
];

const getVenueMark = (venue: VenueWithSeries) => {
  const seriesName = venue.series?.name || venue.series_id || "";
  const preferred = seriesName.trim();

  if (!preferred) return "VENUE";

  // If it's already an acronym-ish short token, keep it.
  const token = preferred.split(/\s+/)[0] || preferred;
  if (token.length <= 6 && /^[a-z0-9\-_/]+$/i.test(token)) return token.toUpperCase();

  // Otherwise derive initials from words.
  const words = preferred
    .replace(/[()]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4);
  const initials = words.map((w) => w[0]).join("");
  return (initials || token.slice(0, 6)).toUpperCase();
};

const VenueThumbnail = ({ venue }: { venue: VenueWithSeries }) => {
  const mark = getVenueMark(venue);
  const seriesName = venue.series?.name || venue.series_id;
  const gradient = GRADIENTS[hashString(venue.series_id || venue.id || mark) % GRADIENTS.length];

  return (
    <div
      className={`absolute inset-0 flex items-center justify-center bg-gradient-to-br ${gradient}`}
      aria-label={`Venue thumbnail: ${mark}`}
      title={seriesName}
    >
      <span className="px-2 text-sm font-semibold tracking-wide">{mark}</span>
    </div>
  );
};

// Fetch all series (cached, only needs to be done once)
// Moved outside component since it doesn't depend on component state
const fetchAllSeries = async (): Promise<Record<string, ConferenceSeries>> => {
  // Prefer no trailing slash here because Next.js normalizes `/api/backend/.../` -> `/api/backend/...`
  // with a 308, which can create extra hops/noisy backend logs.
  const url = `${getBackendBaseUrl()}/venues/series`;
  // In dev, avoid caching to prevent a single transient 404 from getting stuck in the browser cache.
  const res = await fetch(url, { cache: process.env.NODE_ENV === "development" ? "reload" : "force-cache" });
  if (!res.ok) {
    // Intentionally do not swallow errors here. Let callers see the real failure.
    const body = await res.text().catch(() => "");
    throw new Error(
      `Failed to load series (${res.status} ${res.statusText}) from ${url}${body ? `: ${body.slice(0, 300)}` : ""}`
    );
  }

  const data: SeriesResponse = await res.json();

  // Create a map for quick lookups
  const map: Record<string, ConferenceSeries> = {};
  for (const series of data.items || []) {
    map[series.id] = series;
  }
  return map;
};

export default function ConferencePage() {
  const [venues, setVenues] = useState<VenueWithSeries[]>([]);
  const [seriesMap, setSeriesMap] = useState<Record<string, ConferenceSeries>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { bookmarkedIds, toggleBookmark } = useBookmarks("venue");


  const [searchQuery, setSearchQuery] = useState("");
  const searchParams = useSearchParams();

  // Temporary filter states (not yet applied)
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedUpcomingOnly, setSelectedUpcomingOnly] = useState(true);
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const categoryDropdownRef = useRef<HTMLDivElement>(null);

  // Applied filter states (used for API)
  const [appliedMinDate, setAppliedMinDate] = useState<string | null>(toISODate(new Date()));

  const fetchAllVenues = async (opts?: { minDate?: string | null; seriesData?: Record<string, ConferenceSeries> }) => {
    setLoading(true);
    setError(null);
    try {
      // Use provided series data or fetch it
      const series = opts?.seriesData || seriesMap;

      // Prefer no trailing slash here to avoid Next's 308 normalization.
      const url = new URL(`${getBackendBaseUrl()}/venues`);
      // Fetch all venues at once (conferences are a small dataset ~200 items)
      url.searchParams.set("limit", "500");

      const minDateToUse = opts?.minDate !== undefined ? opts.minDate : appliedMinDate;
      if (minDateToUse) url.searchParams.set("min_date", minDateToUse);

      const res = await fetch(url.toString(), { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load venues");
      const data: VenuesResponse = await res.json();

      // Join venues with series data
      const venuesWithSeries: VenueWithSeries[] = (data.items || []).map((venue) => ({
        ...venue,
        series: series[venue.series_id],
      }));

      setVenues(venuesWithSeries);
    } catch (err: any) {
      setError(err.message || "Failed to load venues");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Allow deep-linking from global search (/conference?q=...)
    const q = (searchParams.get("q") || "").trim();
    if (q) setSearchQuery(q);

    // Fetch series first (cached), then venues
    const init = async () => {
      const series = await fetchAllSeries();
      setSeriesMap(series);
      await fetchAllVenues({ seriesData: series });
    };
    init().catch((err) => {
      console.error("Failed to initialize:", err);
      setError("Failed to load data");
    });
  }, []);

  // Close category dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(event.target as Node)) {
        setCategoryDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleCategory = (tag: string) => {
    setSelectedCategories((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  };

  const clearCategories = () => setSelectedCategories([]);

  const getCategoryLabel = () => {
    if (selectedCategories.length === 0) return "All Categories";
    if (selectedCategories.length === 1) return selectedCategories[0];
    return `${selectedCategories.length} categories`;
  };

  const handleApplyFilters = () => {
    const minDateValue = selectedUpcomingOnly ? toISODate(new Date()) : null;
    setAppliedMinDate(minDateValue);
    fetchAllVenues({ minDate: minDateValue, seriesData: seriesMap });
  };

  const handleClearFilters = () => {
    clearCategories();
    setSelectedUpcomingOnly(true);
    setSearchQuery("");
    setCategoryDropdownOpen(false);

    const minDateValue = toISODate(new Date());
    setAppliedMinDate(minDateValue);
    fetchAllVenues({ minDate: minDateValue, seriesData: seriesMap });
  };

  const filteredVenues = venues.filter((venue) => {
    // Category filter (client-side) - series must have ALL selected categories (AND logic)
    if (selectedCategories.length > 0) {
      const seriesTags = venue.series?.tags || [];
      const hasAllTags = selectedCategories.every((tag) => seriesTags.includes(tag));
      if (!hasAllTags) return false;
    }

    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    const series = venue.series;
    return Boolean(
      series?.name?.toLowerCase().includes(query) ||
      series?.full_name?.toLowerCase().includes(query) ||
      series?.description?.toLowerCase().includes(query) ||
      venue.place?.toLowerCase().includes(query) ||
      series?.sub?.toLowerCase().includes(query)
    );
  });

  const sortedVenues = [...filteredVenues].sort((a, b) =>
    getVenueSortName(a).localeCompare(getVenueSortName(b), undefined, { sensitivity: "base" })
  );

  return (
    <div className="mx-auto w-full max-w-7xl min-[1600px]:max-w-[1400px] min-[2000px]:max-w-[1700px] px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="bg-gradient-to-br from-green-50 to-blue-50 border border-green-200 rounded-2xl p-6 shadow-sm max-md:p-4">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col md:flex-row gap-4 md:gap-8 max-md:gap-1 items-center">
            <div className="flex-none w-full md:w-auto md:max-w-xl flex flex-col gap-3 max-md:order-2 max-md:gap-2">
              <div className="max-md:text-center">
                <h1 className={`text-5xl font-bold text-gray-900 max-md:text-3xl max-md:leading-tight ${playfairDisplay.className}`}>
                  Conferences
                </h1>
                <p className="text-gray-600 text-base mt-3 break-words max-md:text-sm max-md:mt-2">
                  Explore conferences, workshops, and other ML/AI venues around the world.
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search conferences..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className={`w-full px-4 py-2 pl-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-colors max-md:py-2.5 max-md:text-base ${searchQuery.trim().length > 0 ? "bg-white" : "bg-gray-100"
                      }`}
                  />
                  <svg
                    className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400"
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

                <div className="flex gap-2 flex-wrap items-center max-md:flex-col max-md:items-stretch max-md:w-full">
                  <div ref={categoryDropdownRef} className="relative min-w-[220px] max-md:w-full max-md:min-w-0">
                    <button
                      onClick={() => setCategoryDropdownOpen((v) => !v)}
                      className="w-48 max-md:w-full px-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white text-left flex items-center justify-between max-md:py-2.5 max-md:text-base"
                      aria-label="Select categories"
                    >
                      <span className="truncate">Category: {getCategoryLabel()}</span>
                      <svg
                        className={`w-4 h-4 transition-transform ${categoryDropdownOpen ? "rotate-180" : ""}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {categoryDropdownOpen && (
                      <div className="absolute z-50 mt-1 w-full max-w-md bg-white border border-gray-300 rounded-lg shadow-lg overflow-hidden">
                        <div className="p-2 border-b border-gray-200 flex items-center justify-between gap-2">
                          <p className="text-xs text-gray-600">Select one or more categories</p>
                          <button
                            onClick={clearCategories}
                            className="text-xs text-gray-700 hover:text-gray-900 underline"
                            type="button"
                          >
                            Clear
                          </button>
                        </div>
                        <div className="max-h-64 overflow-y-auto">
                          {CATEGORY_TAGS.map((tag) => {
                            const checked = selectedCategories.includes(tag);
                            return (
                              <label
                                key={tag}
                                className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 transition cursor-pointer"
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleCategory(tag)}
                                  className="h-4 w-4 shrink-0 accent-green-600"
                                />
                                <span className={`${checked ? "text-green-700" : "text-gray-800"}`}>{tag}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  <label className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-lg border border-gray-300 bg-white text-gray-700 select-none max-md:w-full max-md:justify-center max-md:py-2.5">
                    <input
                      type="checkbox"
                      checked={selectedUpcomingOnly}
                      onChange={(e) => setSelectedUpcomingOnly(e.target.checked)}
                      className="h-4 w-4 shrink-0 accent-green-600"
                    />
                    Upcoming only
                  </label>

                  <div className="flex items-center space-x-2 max-md:w-full max-md:space-x-2">
                    <button
                      onClick={handleApplyFilters}
                      className="px-4 py-2 text-sm rounded-lg bg-green-500 text-white hover:bg-green-600 transition max-md:flex-1 max-md:py-2.5"
                    >
                      Apply
                    </button>
                    <button
                      onClick={handleClearFilters}
                      className="px-4 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 bg-white hover:bg-gray-100 transition max-md:flex-1 max-md:py-2.5"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex-1 flex items-center justify-center min-h-[280px] max-md:order-1 max-md:min-h-0 max-md:py-0 max-md:flex-none">
              <Image
                src="/podium.png"
                alt="Conferences illustration"
                width={350}
                height={350}
                className="opacity-80 max-w-full h-auto max-md:max-h-40 max-md:w-auto"
              />
            </div>
          </div>
        </div>
      </div>

      {loading && (
        <div className="flex flex-col items-center justify-center py-12">
          <LoadingSpinner size="lg" />
          <p className="mt-4 text-gray-500 font-medium">Loading venues...</p>
        </div>
      )}

      {error && <div className="text-red-600 text-sm">{error}</div>}

      {!loading && !error && venues.length === 0 && <div className="text-gray-500">No venues found.</div>}

      {!loading && !error && venues.length > 0 && filteredVenues.length === 0 && (
        <div className="text-gray-500">No venues match your search.</div>
      )}

      {/* Responsive grid: 1 col mobile, 2 tablet, 3 desktop */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {sortedVenues.map((venue) => {
          const series = venue.series;
          const tags = series?.tags || [];
          return (
            <div
              key={venue.id}
              className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm hover:shadow-md hover:border-green-200 transition-all duration-200 flex flex-col relative"
            >
              <Link
                href={`/conference/${venue.id}`}
                className="absolute inset-0 z-0"
                aria-label={`View details for ${series?.name || venue.series_id}`}
              />
              {/* Header: Thumbnail + Title */}
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-14 h-14 relative rounded-lg border border-gray-100 overflow-hidden">
                  <VenueThumbnail venue={venue} />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-base font-semibold text-gray-900 leading-tight line-clamp-2">
                    {series?.name || venue.series_id}
                    {venue.year ? ` ${venue.year}` : ""}
                  </h2>
                  {venue.place && (
                    <p className="text-xs text-gray-500 mt-1 truncate">{venue.place}</p>
                  )}
                </div>
              </div>

              {/* Date & Deadline */}
              <div className="mt-3 space-y-1 text-xs text-gray-600">
                {(venue.conference_start_date || venue.conference_end_date) && (
                  <div className="flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span>
                      {venue.conference_start_date}
                      {venue.conference_start_date && venue.conference_end_date && venue.conference_start_date !== venue.conference_end_date && ` – ${venue.conference_end_date}`}
                    </span>
                  </div>
                )}
                {venue.timeline && venue.timeline.length > 0 && venue.timeline[0].pdf_deadline && (
                  <div className="flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Deadline: {venue.timeline[0].pdf_deadline}</span>
                  </div>
                )}
              </div>

              {/* Tags (from series) */}
              {tags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1">
                  {tags.slice(0, 2).map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-0.5 text-xs bg-green-50 text-green-700 border border-green-100 rounded-full"
                    >
                      {tag}
                    </span>
                  ))}
                  {tags.length > 2 && (
                    <span className="px-2 py-0.5 text-xs bg-green-50 text-green-700 border border-green-100 rounded-full">
                      +{tags.length - 2}
                    </span>
                  )}
                </div>
              )}

              {/* Website link - smaller and less intrusive */}
              <div className="mt-auto pt-3 flex items-center justify-center relative z-10">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleBookmark(venue.id);
                  }}
                  className={`inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full border transition-all text-xs ${bookmarkedIds[venue.id]
                    ? "border-green-300 bg-green-50 text-green-800"
                    : "border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100"
                    }`}
                  title={bookmarkedIds[venue.id] ? "Remove bookmark" : "Bookmark this conference"}
                >
                  <span aria-hidden="true">{bookmarkedIds[venue.id] ? "🔖" : "📑"}</span>
                  <span>{bookmarkedIds[venue.id] ? "Bookmarked" : "Bookmark"}</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Results count */}
      {!loading && !error && sortedVenues.length > 0 && (
        <div className="text-center text-sm text-gray-500 mt-4">
          Showing {sortedVenues.length} conference{sortedVenues.length !== 1 ? "s" : ""}
        </div>
      )}


    </div>
  );
}

