"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { getBackendBaseUrl } from "@/lib/backendUrl";
import { useAuth } from "@/lib/authContext";
import { PaperCoverArt } from "@/app/components/PaperCoverArt";

interface Bookmark {
    bookmark_id: string;
    resource_id: string;
    resource_type: string;
    added_at: string;
}

interface BookmarkListResponse {
    items: Bookmark[];
    limit: number;
    next_cursor: string | null;
    has_more: boolean;
}

interface ResourceDetail {
    id: string;
    title?: string;
    name?: string;
    authors?: string[];
    description?: string;
    pdf_url?: string;
    domain?: string;
}

const DOMAIN_ICONS: Record<string, string> = {
    cv: "/icons/cv.png",
    nlp: "/icons/nlp.png",
    audio: "/icons/audio.png",
    robots: "/icons/robotics.png",
    time_series: "/icons/timeseries.png",
    multimodal: "/icons/multi.png",
    theory: "/icons/theory.png",
    other: "/icons/cv.png",
};

const getDomainIcon = (domain?: string): string => {
    if (!domain) return "/icons/cv.png";
    return DOMAIN_ICONS[domain] || "/icons/cv.png";
};

interface BookmarkSectionProps {
    title: string;
    resourceType: "paper" | "dataset" | "venue";
    colorTheme: "blue" | "green" | "purple";
    defaultOpen?: boolean;
}

function stripWrappingQuotes(s: string): string {
    const t = s.trim();
    if (t.length >= 2) {
        if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
            return t.slice(1, -1).trim();
        }
    }
    return t;
}

function getIcon(type: "paper" | "dataset" | "venue", className: string) {
    if (type === "paper") {
        return (
            <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
        );
    }
    if (type === "dataset") {
        // Benchmark icon
        return (
            <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
        );
    }
    if (type === "venue") {
        // Conference icon
        return (
            <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
        );
    }
    return null;
}

export default function BookmarkSection({
    title,
    resourceType,
    colorTheme,
    defaultOpen = false,
}: BookmarkSectionProps) {
    const { user } = useAuth();
    const [isOpen, setIsOpen] = useState(defaultOpen);

    // Pagination state
    const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
    const [details, setDetails] = useState<Record<string, ResourceDetail>>({});

    // Cursor history for navigation
    const [prevCursors, setPrevCursors] = useState<(string | null)[]>([null]);
    const [nextCursor, setNextCursor] = useState<string | null>(null);
    const [hasMore, setHasMore] = useState(false);

    const [loading, setLoading] = useState(false);
    const [initialLoadDone, setInitialLoadDone] = useState(false);

    const LIMIT = 5;

    const fetchBookmarks = async (cursor: string | null) => {
        if (!user) return;
        setLoading(true);
        try {
            const token = await user.getIdToken();
            // Explicitly filter to ensure strict type matching
            const url = new URL(`${getBackendBaseUrl()}/users/me/bookmarks`);
            url.searchParams.set("resource_type", resourceType);
            url.searchParams.set("limit", String(LIMIT));
            if (cursor) url.searchParams.set("cursor", cursor);

            const res = await fetch(url.toString(), {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) throw new Error("Failed to fetch bookmarks");

            const data: BookmarkListResponse = await res.json();

            const newItems = data.items || [];
            const filteredItems = newItems.filter(i => i.resource_type === resourceType);

            setBookmarks(filteredItems);
            setNextCursor(data.next_cursor || null);
            setHasMore(data.has_more);

            const newIds = filteredItems.map(b => b.resource_id);
            if (newIds.length > 0) {
                fetchDetails(newIds);
            }
        } catch (err) {
            console.error(err);
            setBookmarks([]);
        } finally {
            setLoading(false);
            setInitialLoadDone(true);
        }
    };

    const fetchDetails = async (ids: string[]) => {
        if (ids.length === 0) return;
        try {
            let endpoint = "";
            if (resourceType === "paper") endpoint = "/papers/bulk";
            else if (resourceType === "dataset") endpoint = "/datasets/bulk";
            else if (resourceType === "venue") endpoint = "/venues/bulk";

            const url = new URL(`${getBackendBaseUrl()}${endpoint}`);
            ids.forEach(id => url.searchParams.append("ids", id));

            const res = await fetch(url.toString());
            if (res.ok) {
                const data = await res.json();
                const items = data.items || [];
                setDetails(prev => {
                    const next = { ...prev };
                    items.forEach((item: ResourceDetail) => {
                        next[item.id] = item;
                    });
                    return next;
                });
            }
        } catch (err) {
            console.error(err);
        }
    };

    const handleDelete = async (resourceId: string, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        if (!confirm("Are you sure you want to delete this bookmark?")) return;

        const originalBookmarks = [...bookmarks];
        setBookmarks(prev => prev.filter(b => b.resource_id !== resourceId));

        try {
            const token = await user?.getIdToken();
            const res = await fetch(`${getBackendBaseUrl()}/users/me/bookmarks/${resourceId}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) {
                setBookmarks(originalBookmarks);
                alert("Failed to delete bookmark.");
            }
        } catch (err) {
            console.error(err);
            setBookmarks(originalBookmarks);
        }
    };

    const handleNext = () => {
        if (!hasMore || !nextCursor) return;
        setPrevCursors(prev => [...prev, nextCursor]);
        fetchBookmarks(nextCursor);
    };

    const handlePrev = () => {
        if (prevCursors.length <= 1) return;
        const newCursors = prevCursors.slice(0, -1);
        const targetCursor = newCursors[newCursors.length - 1];
        setPrevCursors(newCursors);
        fetchBookmarks(targetCursor);
    };

    useEffect(() => {
        if (isOpen && !initialLoadDone && user) {
            fetchBookmarks(null);
        }
    }, [isOpen, user, initialLoadDone]);

    // Styles based on theme
    const themeClasses = {
        blue: {
            border: "border-blue-200",
            bg: "bg-blue-50",
            text: "text-blue-800",
            hover: "hover:bg-blue-100",
            icon: "text-blue-600 bg-blue-100",
        },
        green: {
            border: "border-green-200",
            bg: "bg-green-50",
            text: "text-green-800",
            hover: "hover:bg-green-100",
            icon: "text-green-600 bg-green-100",
        },
        purple: {
            border: "border-purple-200",
            bg: "bg-purple-50",
            text: "text-purple-800",
            hover: "hover:bg-purple-100",
            icon: "text-purple-600 bg-purple-100",
        },
    }[colorTheme];

    const getLink = (id: string) => {
        if (resourceType === "paper") return `/papers/${id}`;
        if (resourceType === "dataset") return `/datasets/${id}`;
        return `/conference?q=${id}`;
    };

    const currentPage = prevCursors.length;

    return (
        <div className={`border rounded-xl overflow-hidden shadow-sm bg-white ${themeClasses.border}`}>
            {/* Header */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`w-full flex items-center justify-between px-6 py-4 ${themeClasses.bg} ${themeClasses.hover} transition-colors text-left rounded-t-xl`}
            >
                <div className="flex items-center gap-3">
                    {getIcon(resourceType, "w-5 h-5 opacity-70")}
                    <span className={`font-semibold text-lg ${themeClasses.text}`}>{title}</span>
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-xs font-medium opacity-60">
                        {loading ? "Loading..." : (initialLoadDone ? (bookmarks.length === 0 && textHasNoBookmarks(resourceType, bookmarks, hasMore, prevCursors) ? "0 items" : "") : "")}
                    </span>
                    <svg
                        className={`w-5 h-5 transform transition-transform duration-200 ${isOpen ? "rotate-180" : ""} ${themeClasses.text}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                </div>
            </button>

            {/* Content */}
            {isOpen && (
                <div className="p-4 sm:p-6">
                    {loading && bookmarks.length === 0 ? (
                        <div className="space-y-4">
                            {[...Array(3)].map((_, i) => (
                                <div key={i} className="animate-pulse flex items-center gap-4 p-3 border rounded-lg">
                                    <div className="w-12 h-16 bg-gray-200 rounded"></div>
                                    <div className="flex-1 space-y-2">
                                        <div className="h-4 bg-gray-200 rounded w-1/3"></div>
                                        <div className="h-3 bg-gray-200 rounded w-1/4"></div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : bookmarks.length === 0 ? (
                        <div className="text-center py-8 text-gray-500 text-sm">
                            No archived {title.toLowerCase()} found.
                        </div>
                    ) : (
                        <div className="flex flex-col gap-3">
                            {bookmarks.map((bookmark) => {
                                const detail = details[bookmark.resource_id];
                                const displayName = stripWrappingQuotes(detail?.title || detail?.name || bookmark.resource_id);

                                return (
                                    <div
                                        key={bookmark.bookmark_id}
                                        className="group relative flex items-center gap-4 p-3 rounded-lg border border-gray-100 hover:border-gray-200 hover:shadow-sm transition-all bg-white"
                                    >
                                        {/* Thumbnail */}
                                        <Link
                                            href={getLink(bookmark.resource_id)}
                                            target="_blank"
                                            className="flex-shrink-0 w-12 h-16 relative rounded overflow-hidden shadow-sm hover:opacity-90 transition-opacity bg-gray-50"
                                        >
                                            {resourceType === "paper" ? (
                                                <PaperCoverArt
                                                    seed={displayUtils(bookmark.resource_id, detail)}
                                                    title={displayName}
                                                    authors={detail?.authors}
                                                    className="w-full h-full text-[8px]"
                                                />
                                            ) : resourceType === "dataset" ? (
                                                <div className="w-full h-full bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-2">
                                                    <div className="relative w-full h-full">
                                                        <Image
                                                            src={getDomainIcon(detail?.domain)}
                                                            alt={detail?.domain || "dataset"}
                                                            fill
                                                            sizes="48px"
                                                            className="object-contain"
                                                        />
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className={`w-full h-full flex items-center justify-center ${themeClasses.icon}`}>
                                                    <span className="text-xs font-bold uppercase">{resourceType.slice(0, 2)}</span>
                                                </div>
                                            )}
                                        </Link>

                                        {/* Content */}
                                        <div className="flex-1 min-w-0">
                                            <Link
                                                href={getLink(bookmark.resource_id)}
                                                target="_blank"
                                                className="block group-hover:text-green-700 transition-colors"
                                            >
                                                <h4 className="text-sm font-medium text-gray-900 truncate" title={displayName}>
                                                    {displayName}
                                                </h4>
                                                {/* Authors (if any) */}
                                                {detail?.authors && detail.authors.length > 0 && (
                                                    <p className="text-xs text-gray-600 mt-1 truncate">
                                                        {detail.authors[0]} et al.
                                                    </p>
                                                )}
                                                {/* Added Date (Correctly separated) */}
                                                <p className="text-[10px] text-gray-400 mt-1 truncate">
                                                    Added on {formatDate(bookmark.added_at)}
                                                </p>
                                            </Link>
                                        </div>

                                        {/* Actions */}
                                        <div className="flex items-center gap-3">
                                            <Link
                                                href={getLink(bookmark.resource_id)}
                                                target="_blank"
                                                className="p-1.5 text-gray-400 hover:text-green-600 transition-colors"
                                                title="Open URL"
                                            >
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                                </svg>
                                            </Link>

                                            <button
                                                onClick={(e) => handleDelete(bookmark.resource_id, e)}
                                                className="p-1.5 text-gray-400 hover:text-red-600 transition-colors"
                                                title="Delete"
                                            >
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                </svg>
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Pager */}
                    {(hasMore || prevCursors.length > 1) && (
                        <div className="mt-6 flex justify-end gap-2 items-center">
                            <button
                                onClick={handlePrev}
                                disabled={prevCursors.length <= 1 || loading}
                                className="px-3 py-1.5 text-sm rounded border border-gray-200 text-gray-600 disabled:opacity-30 hover:bg-gray-50 transition-colors"
                            >
                                Previous
                            </button>
                            <div className="flex items-center justify-center w-8 h-8 rounded bg-gray-100 text-xs font-semibold text-gray-700">
                                {currentPage}
                            </div>
                            <button
                                onClick={handleNext}
                                disabled={!hasMore || loading}
                                className="px-3 py-1.5 text-sm rounded border border-gray-200 text-gray-600 disabled:opacity-30 hover:bg-gray-50 transition-colors"
                            >
                                Next
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function textHasNoBookmarks(type: string, list: any[], hasMore: boolean, prev: any[]) {
    return list.length === 0 && !hasMore && prev.length === 1;
}

function displayUtils(id: string, detail?: ResourceDetail) {
    if (!detail) return id;
    if (detail.title) return detail.title + (detail.authors?.[0] || "");
    return id;
}

function formatDate(iso: string) {
    if (!iso) return "";
    try {
        return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
        return "";
    }
}
