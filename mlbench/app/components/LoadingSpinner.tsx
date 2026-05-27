"use client";

interface LoadingSpinnerProps {
    className?: string;
    size?: "sm" | "md" | "lg";
}

export function LoadingSpinner({ className = "", size = "md" }: LoadingSpinnerProps) {
    const sizeClasses = {
        sm: "w-4 h-4 border-2",
        md: "w-8 h-8 border-3",
        lg: "w-12 h-12 border-4",
    };

    return (
        <div className={`flex items-center justify-center ${className}`}>
            <div
                className={`${sizeClasses[size]} border-gray-200 border-t-green-500 rounded-full animate-spin`}
                role="status"
                aria-label="Loading"
            >
                <span className="sr-only">Loading...</span>
            </div>
        </div>
    );
}
