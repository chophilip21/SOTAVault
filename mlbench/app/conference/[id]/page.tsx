"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { getBackendBaseUrl } from "@/lib/backendUrl";
import { useBookmarks } from "@/hooks/useBookmarks";

// --- Types & Helpers (Ported from conference/page.tsx) ---

interface VenueTimeline {
    abstract_deadline?: string | null;
    pdf_deadline?: string | null;
}

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

const hashString = (s: string) => {
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

const getVenueMark = (seriesName: string) => {
    const preferred = seriesName.trim();
    if (!preferred) return "VENUE";

    const token = preferred.split(/\s+/)[0] || preferred;
    if (token.length <= 6 && /^[a-z0-9\-_/]+$/i.test(token)) return token.toUpperCase();

    const words = preferred
        .replace(/[()]/g, " ")
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 4);
    const initials = words.map((w) => w[0]).join("");
    return (initials || token.slice(0, 6)).toUpperCase();
};

const VenueThumbnail = ({ venue, series }: { venue: Venue; series?: ConferenceSeries }) => {
    const name = series?.name || venue.series_id || "";
    const mark = getVenueMark(name);
    const gradient = GRADIENTS[hashString(venue.series_id || venue.id || mark) % GRADIENTS.length];

    return (
        <div
            className={`absolute inset-0 flex items-center justify-center bg-gradient-to-br ${gradient}`}
            aria-label={`Venue thumbnail: ${mark}`}
            title={name}
        >
            <span className="px-2 text-sm font-semibold tracking-wide">{mark}</span>
        </div>
    );
};

export default function VenueDetailPage() {
    const params = useParams();
    const venueId = params.id as string;

    const [venue, setVenue] = useState<Venue | null>(null);
    const [series, setSeries] = useState<ConferenceSeries | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const { bookmarkedIds, toggleBookmark } = useBookmarks("venue");

    useEffect(() => {
        const fetchVenueData = async () => {
            if (!venueId) return;
            setLoading(true);
            setError(null);
            try {
                // Fetch Venue
                const venueRes = await fetch(`${getBackendBaseUrl()}/venues/${venueId}`);
                if (!venueRes.ok) {
                    if (venueRes.status === 404) throw new Error("Venue not found");
                    throw new Error("Failed to load venue");
                }
                const venueData: Venue = await venueRes.json();
                setVenue(venueData);

                // Fetch Series
                if (venueData.series_id) {
                    const seriesRes = await fetch(`${getBackendBaseUrl()}/venues/series/${venueData.series_id}`);
                    if (seriesRes.ok) {
                        const seriesData: ConferenceSeries = await seriesRes.json();
                        setSeries(seriesData);
                    }
                }
            } catch (err: any) {
                setError(err.message || "Failed to load venue");
            } finally {
                setLoading(false);
            }
        };

        fetchVenueData();
    }, [venueId]);

    if (loading) {
        return (
            <div className="mx-auto w-full max-w-7xl min-[1600px]:max-w-[1400px] min-[2000px]:max-w-[1700px] px-4 sm:px-6 lg:px-8 py-8">
                <div className="text-gray-500">Loading conference...</div>
            </div>
        );
    }

    if (error || !venue) {
        return (
            <div className="mx-auto w-full max-w-7xl min-[1600px]:max-w-[1400px] min-[2000px]:max-w-[1700px] px-4 sm:px-6 lg:px-8 py-8">
                <div className="text-red-600">{error || "Conference not found"}</div>
                <Link href="/conference" className="text-green-600 hover:underline mt-4 inline-block">
                    ← Back to Conferences
                </Link>
            </div>
        );
    }

    const tags = series?.tags || [];
    const displayName = `${series?.name || venue.series_id}${venue.year ? ` ${venue.year}` : ""}`;

    return (
        <div className="mx-auto w-full max-w-7xl min-[1600px]:max-w-[1400px] min-[2000px]:max-w-[1700px] px-4 sm:px-6 lg:px-8 py-8 space-y-6">
            <Link href="/conference" className="text-green-600 hover:underline inline-flex items-center gap-1">
                <span>←</span> Back to Conferences
            </Link>

            <div className="bg-white border border-gray-100 rounded-2xl p-8 shadow-sm">
                <div className="flex items-start gap-6">
                    <div className="flex-shrink-0 w-32 h-32 relative rounded-xl border border-gray-100 overflow-hidden group">
                        <VenueThumbnail venue={venue} series={series || undefined} />

                        {/* Bookmark button overlay */}
                        <button
                            onClick={() => venue.id && toggleBookmark(venue.id)}
                            className={`absolute top-2 right-2 p-2 rounded-full border transition-all shadow-sm ${venue.id && bookmarkedIds[venue.id]
                                ? "border-green-300 bg-green-50 text-green-800 opacity-100"
                                : "border-white bg-white/90 text-gray-600 opacity-0 group-hover:opacity-100"
                                }`}
                            title={venue.id && bookmarkedIds[venue.id] ? "Remove bookmark" : "Add bookmark"}
                            aria-label={venue.id && bookmarkedIds[venue.id] ? "Remove bookmark" : "Add bookmark"}
                        >
                            <span aria-hidden="true" className="text-lg leading-none">
                                {venue.id && bookmarkedIds[venue.id] ? "🔖" : "📑"}
                            </span>
                        </button>
                    </div>

                    <div className="flex-1">
                        <h1 className="text-4xl font-bold text-gray-900 leading-tight">
                            {displayName}
                        </h1>
                        {series?.full_name && (
                            <p className="text-xl text-gray-600 mt-2">{series.full_name}</p>
                        )}

                        {/* Tags moved to header for better visibility, similar to datasets */}
                        {tags.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-4">
                                {tags.map((tag) => (
                                    <span
                                        key={tag}
                                        className="px-3 py-1 text-sm bg-green-50 text-green-700 rounded-full"
                                    >
                                        {tag}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Description */}
                {series?.description && (
                    <div className="mt-8 pt-6 border-t border-gray-100">
                        <h2 className="text-lg font-semibold text-gray-900 mb-2">About</h2>
                        <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                            {series.description}
                        </p>
                    </div>
                )}

                {/* Details Grid */}
                <div className="mt-8 pt-6 border-t border-gray-100">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4">Key Details</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Date */}
                        {(venue.conference_start_date || venue.conference_end_date) && (
                            <div className="bg-gray-50 rounded-lg p-4">
                                <div className="flex items-center gap-2 text-gray-500 text-sm font-medium mb-1">
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                    Conference Date
                                </div>
                                <p className="text-gray-900 font-medium text-lg">
                                    {venue.conference_start_date}
                                    {venue.conference_start_date && venue.conference_end_date && venue.conference_start_date !== venue.conference_end_date && ` – ${venue.conference_end_date}`}
                                </p>
                            </div>
                        )}

                        {/* Location */}
                        {venue.place && (
                            <div className="bg-gray-50 rounded-lg p-4">
                                <div className="flex items-center gap-2 text-gray-500 text-sm font-medium mb-1">
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                    </svg>
                                    Location
                                </div>
                                <p className="text-gray-900 font-medium text-lg">{venue.place}</p>
                            </div>
                        )}

                        {/* Abstract Deadline */}
                        {venue.timeline && venue.timeline.length > 0 && venue.timeline[0].abstract_deadline && (
                            <div className="bg-amber-50 rounded-lg p-4">
                                <div className="flex items-center gap-2 text-amber-600 text-sm font-medium mb-1">
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    Abstract Deadline
                                </div>
                                <p className="text-gray-900 font-medium text-lg">{venue.timeline[0].abstract_deadline}</p>
                            </div>
                        )}

                        {/* Paper Deadline */}
                        {venue.timeline && venue.timeline.length > 0 && venue.timeline[0].pdf_deadline && (
                            <div className="bg-red-50 rounded-lg p-4">
                                <div className="flex items-center gap-2 text-red-600 text-sm font-medium mb-1">
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    Paper Deadline
                                </div>
                                <p className="text-gray-900 font-medium text-lg">{venue.timeline[0].pdf_deadline}</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Website Button */}
                {venue.website && (
                    <div className="mt-8 pt-6 border-t border-gray-100 flex justify-center">
                        <a
                            href={venue.website}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition font-medium text-base shadow-sm hover:shadow"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                            Visit Conference Website
                        </a>
                    </div>
                )}
            </div>
        </div>
    );
}
