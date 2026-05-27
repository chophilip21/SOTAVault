/**
 * Utility for rendering text with LaTeX mathematical notation.
 * 
 * Supports inline math with $...$ delimiters and display math with $$...$$ delimiters.
 * Falls back to plain text if KaTeX fails to parse.
 */

import React from 'react';
import { InlineMath, BlockMath } from 'react-katex';
import 'katex/dist/katex.min.css';

interface MathTextProps {
    children: string;
    className?: string;
}

/**
 * Renders text with LaTeX math notation support.
 * 
 * Examples:
 * - "M$^3$" renders as M with superscript 3
 * - "The formula $E=mc^2$ is famous" renders with inline math
 * - "$$\int_0^1 x^2 dx$$" renders as display math
 * 
 * @param children - Text potentially containing LaTeX math notation
 * @param className - Optional CSS class for the container
 */
export function MathText({ children, className }: MathTextProps) {
    if (!children) {
        return null;
    }

    try {
        // Split text by math delimiters while preserving them
        // Matches: $$...$$ (display) or $...$ (inline)
        const parts = children.split(/(\$\$[^$]+\$\$|\$[^$]+\$)/g);

        return (
            <span className={className}>
                {parts.map((part, index) => {
                    // Display math ($$...$$)
                    if (part.startsWith('$$') && part.endsWith('$$')) {
                        const math = part.slice(2, -2);
                        return (
                            <span key={index} className="block my-2">
                                <BlockMath math={math} />
                            </span>
                        );
                    }

                    // Inline math ($...$)
                    if (part.startsWith('$') && part.endsWith('$')) {
                        const math = part.slice(1, -1);
                        try {
                            return <InlineMath key={index} math={math} />;
                        } catch (err) {
                            // If KaTeX fails to parse, show original text
                            console.warn(`Failed to parse LaTeX: ${math}`, err);
                            return <span key={index}>{part}</span>;
                        }
                    }

                    // Plain text
                    return <span key={index}>{part}</span>;
                })}
            </span>
        );
    } catch (err) {
        // Fallback to plain text if parsing fails completely
        console.error('MathText rendering error:', err);
        return <span className={className}>{children}</span>;
    }
}

/**
 * Sanitizes text by escaping problematic LaTeX characters.
 * Use this as a fallback if you don't want to render LaTeX.
 * 
 * @param text - Text to sanitize
 */
export function sanitizeMathText(text: string): string {
    if (!text) return text;

    // Remove or escape common LaTeX patterns that might cause issues
    return text
        .replace(/\$\$/g, '') // Remove display math delimiters
        .replace(/\$/g, '');   // Remove inline math delimiters
}

/**
 * Checks if text contains LaTeX math notation.
 * 
 * @param text - Text to check
 */
export function hasLatexNotation(text: string): boolean {
    if (!text) return false;
    return /\$[^$]+\$/.test(text);
}
