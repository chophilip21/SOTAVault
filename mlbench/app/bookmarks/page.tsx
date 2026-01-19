"use client";

import BookmarksTab from "./BookmarksTab";

export default function BookmarksPage() {
    return (
        <div className="min-h-screen bg-gray-50 py-8">
            <div className="mx-auto w-full max-w-7xl min-[1600px]:max-w-[1400px] min-[2000px]:max-w-[1700px] px-4 sm:px-6 lg:px-8 space-y-6">
                <BookmarksTab />
            </div>
        </div>
    );
}
