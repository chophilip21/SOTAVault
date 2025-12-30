'use client';

import { useAuth } from "@/lib/authContext";
import { isAuthBypassed } from "@/lib/devFlags";
import Link from "next/link";
import { ReactNode, MouseEvent } from "react";

interface ProtectedLinkProps {
  href: string;
  children: ReactNode;
  className?: string;
  onLoginRequired?: () => void;
  onClick?: () => void;
}

// Routes that require authentication
const protectedRoutes = ['/papers', '/benchmark', '/conference', '/bookmarks', '/datasets', '/ai-chat'];

export default function ProtectedLink({ 
  href, 
  children, 
  className = '', 
  onLoginRequired,
  onClick 
}: ProtectedLinkProps) {
  const { user } = useAuth();
  const bypass = isAuthBypassed();
  const requiresAuth = protectedRoutes.some(route => href.startsWith(route));

  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (!bypass && requiresAuth && !user) {
      e.preventDefault();
      if (onLoginRequired) {
        onLoginRequired();
      }
    } else if (onClick) {
      onClick();
    }
  };

  return (
    <Link href={href} className={className} onClick={handleClick}>
      {children}
    </Link>
  );
}

