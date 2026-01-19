"use client";

import BookmarkSection from "./BookmarkSection";

export default function BookmarksTab() {
    return (
        <div className="space-y-8">
            <div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Your Bookmarks</h2>
                <p className="text-gray-500 text-sm mb-6">
                    Manage your saved papers, datasets, and conferences.
                </p>
            </div>

            <BookmarkSection
                title="Papers"
                resourceType="paper"
                colorTheme="blue"
                defaultOpen={true}
            />

            <BookmarkSection
                title="Datasets"
                resourceType="dataset"
                colorTheme="green"
                defaultOpen={true}
            />

            <BookmarkSection
                title="Conferences"
                resourceType="venue"
                colorTheme="purple"
                defaultOpen={false}
            />
        </div>
    );
}
