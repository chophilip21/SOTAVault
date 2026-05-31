import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/lib/authContext";
import { getBackendBaseUrl } from "@/lib/backendUrl";
import { requestLogin } from "@/lib/routeAccess";

export function useBookmarks(resourceType: "paper" | "dataset" | "dataset_series" | "venue" = "paper") {
    const { user } = useAuth();
    const [bookmarkedIds, setBookmarkedIds] = useState<Record<string, boolean>>({});

    // Debounce refs for bookmark toggles
    const bookmarkTimersRef = useRef<Record<string, NodeJS.Timeout>>({});
    const bookmarkCheckpointsRef = useRef<Record<string, boolean>>({}); // Last confirmed server state

    const fetchUserBookmarks = async () => {
        if (!user) return;
        try {
            const token = await user.getIdToken();
            const url = new URL(`${getBackendBaseUrl()}/users/me/bookmarks`);
            url.searchParams.set("resource_type", resourceType);

            const res = await fetch(url.toString(), {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                const map: Record<string, boolean> = {};
                (data.items || []).forEach((b: any) => {
                    const rId = b.resource_id || b.paper_id;
                    if (rId) map[rId] = true;
                });
                setBookmarkedIds(map);
                // Initialize checkpoints with fetched state
                bookmarkCheckpointsRef.current = { ...map };
            }
        } catch {
            // ignore silently
        }
    };

    useEffect(() => {
        if (user) {
            fetchUserBookmarks();
        } else {
            setBookmarkedIds({});
            bookmarkCheckpointsRef.current = {};
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user, resourceType]);

    const toggleBookmark = async (resourceId: string, title?: string) => {
        if (!user) {
            requestLogin();
            return;
        }

        // 1. Clear any pending timer for this item
        if (bookmarkTimersRef.current[resourceId]) {
            clearTimeout(bookmarkTimersRef.current[resourceId]);
            delete bookmarkTimersRef.current[resourceId];
        }

        // 2. Optimistic UI update
        const nextState = !bookmarkedIds[resourceId];
        setBookmarkedIds((prev) => ({ ...prev, [resourceId]: nextState }));

        // 3. Set debounce timer (coalescing)
        bookmarkTimersRef.current[resourceId] = setTimeout(async () => {
            // Remove timer ref
            delete bookmarkTimersRef.current[resourceId];

            // Coalescing check: if current intention matches last confirmed checkpoint, do nothing.
            const lastConfirmed = !!bookmarkCheckpointsRef.current[resourceId];
            if (nextState === lastConfirmed) {
                return; // User toggled back to original state, no API call needed.
            }

            try {
                const token = await user.getIdToken();
                const url = nextState
                    ? `${getBackendBaseUrl()}/users/me/bookmarks`
                    : `${getBackendBaseUrl()}/users/me/bookmarks/${resourceId}`;

                const method = nextState ? "POST" : "DELETE";
                const body = nextState ? JSON.stringify({
                    resource_id: resourceId,
                    resource_type: resourceType,
                    title: title
                }) : undefined;

                const res = await fetch(url, {
                    method,
                    headers: {
                        "Authorization": `Bearer ${token}`,
                        "Content-Type": "application/json",
                    },
                    body
                });

                if (res.ok) {
                    // Success: update checkpoint
                    bookmarkCheckpointsRef.current[resourceId] = nextState;
                } else {
                    // Failure: revert UI to match checkpoint (truth)
                    setBookmarkedIds((prev) => ({ ...prev, [resourceId]: lastConfirmed }));
                }
            } catch (e) {
                // Error: revert UI
                setBookmarkedIds((prev) => ({ ...prev, [resourceId]: lastConfirmed }));
            }
        }, 1000); // 1s debounce window
    };

    return { bookmarkedIds, toggleBookmark, fetchUserBookmarks };
}
