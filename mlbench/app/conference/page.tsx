"use client";

import Image from "next/image";
import { Playfair_Display } from "next/font/google";
import { useEffect, useRef, useState } from "react";
import { config } from "@/lib/config";

const playfairDisplay = Playfair_Display({ subsets: ["latin"], weight: ["700"] });

interface VenueTimeline {
  abstract_deadline?: string | null;
  pdf_deadline?: string | null;
}

interface Venue {
  id: string;
  name: string;
  short_name?: string | null;
  acronym?: string | null;
  type?: string | null;
  year?: number | null;
  website?: string | null;
  description?: string | null;
  sub?: string | null;
  tags?: string[];
  conference_start_date?: string | null;
  conference_end_date?: string | null;
  timeline?: VenueTimeline[];
  place?: string | null;
  paper_count?: number;
  created_at?: string;
  updated_at?: string;
}

interface VenuesResponse {
  items: Venue[];
  limit: number;
  next_cursor?: string | null;
  has_more: boolean;
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

const getVenueSortName = (venue: Venue) => {
  // Prefer base names over the year-appended `name`.
  return (venue.short_name || venue.acronym || venue.name || "").trim();
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

const getVenueMark = (venue: Venue) => {
  const preferred =
    (venue.acronym || "").trim() ||
    (venue.short_name || "").trim() ||
    (venue.name || "").trim();

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

const VenueThumbnail = ({ venue }: { venue: Venue }) => {
  const mark = getVenueMark(venue);
  const gradient = GRADIENTS[hashString(venue.id || venue.name || mark) % GRADIENTS.length];

  return (
    <div
      className={`absolute inset-0 flex items-center justify-center bg-gradient-to-br ${gradient}`}
      aria-label={`Venue thumbnail: ${mark}`}
      title={venue.acronym || venue.short_name || venue.name}
    >
      <span className="px-2 text-sm font-semibold tracking-wide">{mark}</span>
    </div>
  );
};

export default function ConferencePage() {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null);

  const [searchQuery, setSearchQuery] = useState("");

  // Temporary filter states (not yet applied)
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedUpcomingOnly, setSelectedUpcomingOnly] = useState(true);
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const categoryDropdownRef = useRef<HTMLDivElement>(null);

  // Applied filter states (used for API)
  const [appliedMinDate, setAppliedMinDate] = useState<string | null>(toISODate(new Date()));

  const fetchAllVenues = async (opts?: { minDate?: string | null }) => {
    setLoading(true);
    setError(null);
    try {
      const url = new URL(`${config.backendUrl}/venues/`);
      // Fetch all venues at once (conferences are a small dataset ~200 items)
      url.searchParams.set("limit", "500");

      const minDateToUse = opts?.minDate !== undefined ? opts.minDate : appliedMinDate;
      if (minDateToUse) url.searchParams.set("min_date", minDateToUse);

      const res = await fetch(url.toString(), { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load venues");
      const data: VenuesResponse = await res.json();

      setVenues(data.items || []);
    } catch (err: any) {
      setError(err.message || "Failed to load venues");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllVenues();
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
    fetchAllVenues({ minDate: minDateValue });
  };

  const handleClearFilters = () => {
    clearCategories();
    setSelectedUpcomingOnly(true);
    setSearchQuery("");
    setCategoryDropdownOpen(false);

    const minDateValue = toISODate(new Date());
    setAppliedMinDate(minDateValue);
    fetchAllVenues({ minDate: minDateValue });
  };

  const filteredVenues = venues.filter((venue) => {
    // Category filter (client-side) - venue must have ALL selected categories (AND logic)
    if (selectedCategories.length > 0) {
      const venueTags = venue.tags || [];
      const hasAllTags = selectedCategories.every((tag) => venueTags.includes(tag));
      if (!hasAllTags) return false;
    }

    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return Boolean(
      venue.name?.toLowerCase().includes(query) ||
        venue.short_name?.toLowerCase().includes(query) ||
        venue.acronym?.toLowerCase().includes(query) ||
        venue.description?.toLowerCase().includes(query) ||
        venue.place?.toLowerCase().includes(query) ||
        venue.sub?.toLowerCase().includes(query)
    );
  });

  const sortedVenues = [...filteredVenues].sort((a, b) =>
    getVenueSortName(a).localeCompare(getVenueSortName(b), undefined, { sensitivity: "base" })
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="bg-gray-50 rounded-2xl p-6 shadow-sm border border-gray-100">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col md:flex-row gap-4 md:gap-8 items-center">
            <div className="flex-none w-full md:w-auto md:max-w-xl flex flex-col gap-3">
              <div>
                <h1 className={`text-5xl font-bold text-gray-900 ${playfairDisplay.className}`}>
                  Conferences
                </h1>
                <p className="text-gray-600 text-base mt-3 break-words">
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
                    className="w-full px-4 py-2 pl-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
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

                <div className="flex gap-2 flex-wrap items-center">
                  <div ref={categoryDropdownRef} className="relative min-w-[220px]">
                    <button
                      onClick={() => setCategoryDropdownOpen((v) => !v)}
                      className="w-full px-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white text-left flex items-center justify-between"
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
                                  className="h-4 w-4"
                                />
                                <span className={`${checked ? "text-green-700" : "text-gray-800"}`}>{tag}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  <label className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-lg border border-gray-300 bg-white text-gray-700 select-none">
                    <input
                      type="checkbox"
                      checked={selectedUpcomingOnly}
                      onChange={(e) => setSelectedUpcomingOnly(e.target.checked)}
                      className="h-4 w-4"
                    />
                    Upcoming only
                  </label>

                  <div className="flex items-center space-x-2">
                    <button
                      onClick={handleApplyFilters}
                      className="px-4 py-2 text-sm rounded-lg bg-green-500 text-white hover:bg-green-600 transition"
                    >
                      Apply
                    </button>
                    <button
                      onClick={handleClearFilters}
                      className="px-4 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 bg-white hover:bg-gray-100 transition"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex-1 flex items-center justify-center min-h-[280px]">
              <Image
                src="/podium.png"
                alt="Conferences illustration"
                width={350}
                height={350}
                className="opacity-80 max-w-full h-auto"
              />
            </div>
          </div>
        </div>
      </div>

      {loading && <div className="text-gray-500">Loading venues...</div>}

      {error && <div className="text-red-600 text-sm">{error}</div>}

      {!loading && !error && venues.length === 0 && <div className="text-gray-500">No venues found.</div>}

      {!loading && !error && venues.length > 0 && filteredVenues.length === 0 && (
        <div className="text-gray-500">No venues match your search.</div>
      )}

      {/* Responsive grid: 1 col mobile, 2 tablet, 3 desktop */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {sortedVenues.map((venue) => (
          <div
            key={venue.id}
            onClick={() => setSelectedVenue(venue)}
            className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm hover:shadow-md hover:border-green-200 transition-all duration-200 flex flex-col cursor-pointer"
          >
            {/* Header: Thumbnail + Title */}
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-14 h-14 relative rounded-lg border border-gray-100 overflow-hidden">
                <VenueThumbnail venue={venue} />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-semibold text-gray-900 leading-tight line-clamp-2">
                  {venue.short_name || venue.acronym || venue.name}
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

            {/* Tags */}
            {venue.tags && venue.tags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1">
                {venue.tags.slice(0, 2).map((tag) => (
                  <span
                    key={tag}
                    className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded-full"
                  >
                    {tag}
                  </span>
                ))}
                {venue.tags.length > 2 && (
                  <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-500 rounded-full">
                    +{venue.tags.length - 2}
                  </span>
                )}
              </div>
            )}

            {/* Website link - smaller and less intrusive */}
            <div className="mt-auto pt-3">
              {venue.website && (
                <a
                  href={venue.website}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 text-xs text-green-600 hover:text-green-700 hover:underline"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  Website
                </a>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Results count */}
      {!loading && !error && sortedVenues.length > 0 && (
        <div className="text-center text-sm text-gray-500 mt-4">
          Showing {sortedVenues.length} conference{sortedVenues.length !== 1 ? "s" : ""}
        </div>
      )}

      {/* Conference Detail Modal */}
      {selectedVenue && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          onClick={() => setSelectedVenue(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="flex-shrink-0 w-16 h-16 relative rounded-xl border border-gray-100 overflow-hidden">
                  <VenueThumbnail venue={selectedVenue} />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900">
                    {selectedVenue.name}
                  </h2>
                  {(selectedVenue.short_name || selectedVenue.acronym) && (
                    <p className="text-sm text-gray-500">
                      {[selectedVenue.short_name, selectedVenue.acronym].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </div>
              </div>
              <button
                onClick={() => setSelectedVenue(null)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Body */}
            <div className="px-6 py-5 space-y-5">
              {/* Description */}
              {selectedVenue.description && (
                <div>
                  <h3 className="text-sm font-medium text-gray-500 mb-1">About</h3>
                  <p className="text-gray-700">{selectedVenue.description}</p>
                </div>
              )}

              {/* Key Details Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Date */}
                {(selectedVenue.conference_start_date || selectedVenue.conference_end_date) && (
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="flex items-center gap-2 text-gray-500 text-xs font-medium mb-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      Conference Date
                    </div>
                    <p className="text-gray-900 font-medium">
                      {selectedVenue.conference_start_date}
                      {selectedVenue.conference_start_date && selectedVenue.conference_end_date && selectedVenue.conference_start_date !== selectedVenue.conference_end_date && ` – ${selectedVenue.conference_end_date}`}
                    </p>
                  </div>
                )}

                {/* Location */}
                {selectedVenue.place && (
                  <div className="bg-gray-50 rounded-lg p-3">
                    <div className="flex items-center gap-2 text-gray-500 text-xs font-medium mb-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      Location
                    </div>
                    <p className="text-gray-900 font-medium">{selectedVenue.place}</p>
                  </div>
                )}

                {/* Abstract Deadline */}
                {selectedVenue.timeline && selectedVenue.timeline.length > 0 && selectedVenue.timeline[0].abstract_deadline && (
                  <div className="bg-amber-50 rounded-lg p-3">
                    <div className="flex items-center gap-2 text-amber-600 text-xs font-medium mb-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Abstract Deadline
                    </div>
                    <p className="text-gray-900 font-medium">{selectedVenue.timeline[0].abstract_deadline}</p>
                  </div>
                )}

                {/* PDF Deadline */}
                {selectedVenue.timeline && selectedVenue.timeline.length > 0 && selectedVenue.timeline[0].pdf_deadline && (
                  <div className="bg-red-50 rounded-lg p-3">
                    <div className="flex items-center gap-2 text-red-600 text-xs font-medium mb-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Paper Deadline
                    </div>
                    <p className="text-gray-900 font-medium">{selectedVenue.timeline[0].pdf_deadline}</p>
                  </div>
                )}
              </div>

              {/* Tags */}
              {selectedVenue.tags && selectedVenue.tags.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-500 mb-2">Categories</h3>
                  <div className="flex flex-wrap gap-2">
                    {selectedVenue.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-3 py-1 text-sm bg-green-50 text-green-700 rounded-full"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            {selectedVenue.website && (
              <div className="sticky bottom-0 bg-white border-t border-gray-100 px-6 py-4">
                <a
                  href={selectedVenue.website}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition font-medium"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  Visit Conference Website
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

