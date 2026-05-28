"use client";

import BookmarkSection from "./BookmarkSection";

export default function BookmarksTab() {
    return (
        <div className="space-y-8">
            <div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Your Bookmarks</h2>
                <p className="text-gray-500 text-sm mb-6">
                    Manage your saved papers, dataset series, dataset variants, and conferences.
                </p>
            </div>

            <BookmarkSection
                title="Papers"
                resourceType="paper"
                colorTheme="blue"
                defaultOpen={true}
            />

            <BookmarkSection
                title="Dataset Series"
                resourceType="dataset_series"
                colorTheme="teal"
                defaultOpen={true}
            />

            <BookmarkSection
                title="Dataset Variants"
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
