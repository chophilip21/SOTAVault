"use client";

import { useState, useEffect } from "react";
import Image from "next/image";

interface UserAvatarProps {
    uid: string;
    photoUrl?: string | null;
    size?: number;
    className?: string; // Allow passing external styles (like rounded-full, border, etc.)
    alt?: string;
}

export default function UserAvatar({
    uid,
    photoUrl,
    size = 100,
    className = "",
    alt = "User Avatar"
}: UserAvatarProps) {
    // bottts-neutral is part of the v9 API
    const generatedUrl = `https://api.dicebear.com/9.x/bottts-neutral/svg?seed=${uid}`;

    // Initialize src with photoUrl if available, otherwise generatedUrl
    const [imgSrc, setImgSrc] = useState<string>(photoUrl || generatedUrl);

    // Update src if photoUrl changes
    useEffect(() => {
        setImgSrc(photoUrl || generatedUrl);
    }, [photoUrl, generatedUrl]);

    return (
        <div
            className={`relative overflow-hidden bg-slate-200 ${className}`}
            style={{ width: size, height: size, borderRadius: '50%' }}
        >
            <Image
                src={imgSrc}
                alt={alt}
                fill
                className="object-cover"
                unoptimized // Necessary for SVGs from external APIs and arbitrary external URLs
                onError={() => {
                    // If loading fails, fallback to generated URL
                    if (imgSrc !== generatedUrl) {
                        setImgSrc(generatedUrl);
                    }
                }}
            />
        </div>
    );
}
