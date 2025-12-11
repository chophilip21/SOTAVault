"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/authContext";
import { config } from "@/lib/config";

interface Bookmark {
  bookmark_id: string;
  user_id: string;
  paper_id: string;
  added_at: string;
  note: string | null;
  tags: string[];
}

interface Paper {
  id: string;
  title: string;
  abstract: string;
  authors: string[];
  venue: string | null;
  year: number | null;
  arxiv_id: string | null;
  doi: string | null;
  pdf_url: string | null;
}

interface BookmarkWithPaper extends Bookmark {
  paper: Paper | null;
}

export default function BookmarksTab() {
  const { user } = useAuth();
  const [bookmarks, setBookmarks] = useState<BookmarkWithPaper[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      fetchBookmarks();
    }
  }, [user]);

  const fetchBookmarks = async () => {
    try {
      setLoading(true);
      setError(null);
      const token = await user?.getIdToken();
      if (!token) {
        setError("Not authenticated");
        return;
      }

      // Fetch bookmarks
      const bookmarksResponse = await fetch(`${config.backendUrl}/users/me/bookmarks`, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!bookmarksResponse.ok) {
        throw new Error("Failed to fetch bookmarks");
      }

      const bookmarksData = await bookmarksResponse.json();
      const bookmarksList: Bookmark[] = bookmarksData.items || [];

      // Fetch paper details for each bookmark
      const bookmarksWithPapers: BookmarkWithPaper[] = await Promise.all(
        bookmarksList.map(async (bookmark) => {
          try {
            const paperResponse = await fetch(`${config.backendUrl}/papers/${bookmark.paper_id}`, {
              method: "GET",
              headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json",
              },
            });

            if (paperResponse.ok) {
              const paper = await paperResponse.json();
              return { ...bookmark, paper };
            } else {
              return { ...bookmark, paper: null };
            }
          } catch (err) {
            console.error(`Failed to fetch paper ${bookmark.paper_id}:`, err);
            return { ...bookmark, paper: null };
          }
        })
      );

      setBookmarks(bookmarksWithPapers);
    } catch (err) {
      console.error("Error fetching bookmarks:", err);
      setError("Failed to load bookmarks");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500">Loading bookmarks...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-red-600">{error}</div>
      </div>
    );
  }

  if (bookmarks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="text-gray-500 text-lg mb-2">No bookmarks yet</div>
        <p className="text-gray-400 text-sm">Papers you bookmark will appear here</p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-2xl font-semibold text-gray-900 mb-6">Bookmarked Papers</h2>
      
      <div className="space-y-4">
        {bookmarks.map((bookmark) => (
          <div
            key={bookmark.bookmark_id}
            className="border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow"
          >
            {bookmark.paper ? (
              <>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">
                      {bookmark.paper.title}
                    </h3>
                  </div>
                </div>

                {bookmark.paper.authors && bookmark.paper.authors.length > 0 && (
                  <p className="text-sm text-gray-600 mb-2">
                    {bookmark.paper.authors.join(", ")}
                  </p>
                )}

                <div className="flex flex-wrap gap-2 mb-3">
                  {bookmark.paper.venue && (
                    <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">
                      {bookmark.paper.venue}
                    </span>
                  )}
                  {bookmark.paper.year && (
                    <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">
                      {bookmark.paper.year}
                    </span>
                  )}
                  {bookmark.paper.arxiv_id && (
                    <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">
                      arXiv: {bookmark.paper.arxiv_id}
                    </span>
                  )}
                </div>

                {bookmark.paper.abstract && (
                  <p className="text-sm text-gray-600 mb-3 line-clamp-3">
                    {bookmark.paper.abstract}
                  </p>
                )}

                {bookmark.note && (
                  <div className="mt-3 pt-3 border-t border-gray-200">
                    <p className="text-sm text-gray-700">
                      <span className="font-medium">Your note:</span> {bookmark.note}
                    </p>
                  </div>
                )}

                {bookmark.tags && bookmark.tags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {bookmark.tags.map((tag, index) => (
                      <span
                        key={index}
                        className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                <div className="mt-4 text-xs text-gray-500">
                  Bookmarked on {new Date(bookmark.added_at).toLocaleDateString()}
                </div>
              </>
            ) : (
              <div className="text-gray-500">
                <p className="font-medium">Paper not found</p>
                <p className="text-sm">Paper ID: {bookmark.paper_id}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
